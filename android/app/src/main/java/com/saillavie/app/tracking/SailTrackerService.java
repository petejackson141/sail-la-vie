package com.saillavie.app.tracking;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.pm.ServiceInfo;
import android.location.Location;
import android.os.Build;
import android.os.HandlerThread;
import android.os.IBinder;

import androidx.core.app.NotificationCompat;
import androidx.core.app.ServiceCompat;
import androidx.core.content.ContextCompat;

import com.google.android.gms.location.FusedLocationProviderClient;
import com.google.android.gms.location.LocationCallback;
import com.google.android.gms.location.LocationRequest;
import com.google.android.gms.location.LocationResult;
import com.google.android.gms.location.LocationServices;
import com.google.android.gms.location.Priority;

/**
 * Sail la Vie's own GPS recorder.
 *
 * A "foreground service": the thing that shows the ongoing "Recording your
 * journey" notification. While it runs, Android treats the app as in use and
 * keeps delivering GPS fixes with the screen off or another app open.
 *
 * It does ONE job: from start to stop, ask Google's fused location provider
 * for high-accuracy fixes and write every one of them to phone storage
 * (FixStore). It never decides anything about the journey itself; all the
 * filtering, distance and speed logic stays in journey.js, which collects the
 * stored fixes whenever it's awake.
 *
 * Because fixes go to storage first, nothing is lost if the web part of the
 * app is paused or even killed. They just wait until journey.js picks them up.
 */
public class SailTrackerService extends Service {

    private static final String CHANNEL_ID = "sail_tracking";
    private static final int NOTIFICATION_ID = 4711;

    // The running service, if any. Lets the plugin check/restart it directly.
    private static volatile SailTrackerService instance;
    // Called after each batch of fixes is stored, so the plugin can tell the
    // web side "new fixes waiting". Null when the app's UI isn't loaded.
    private static volatile Runnable fixListener;

    private FusedLocationProviderClient client;
    private LocationCallback callback;
    private HandlerThread gpsThread;
    private long intervalMs = 1000;

    static void setFixListener(Runnable listener) { fixListener = listener; }
    static boolean isRunning() { return instance != null; }

    /** Tears down and re-requests GPS updates. Returns false if not running. */
    static boolean restartUpdatesIfRunning() {
        SailTrackerService s = instance;
        if (s == null) return false;
        s.startUpdates();
        return true;
    }

    @Override
    public void onCreate() {
        super.onCreate();
        instance = this;
        client = LocationServices.getFusedLocationProviderClient(this);
        // GPS callbacks arrive on their own background thread, so they keep
        // flowing even if the main (UI) thread is busy or asleep.
        gpsThread = new HandlerThread("SailTrackerGps");
        gpsThread.start();
        callback = new LocationCallback() {
            @Override
            public void onLocationResult(LocationResult result) {
                for (Location location : result.getLocations()) {
                    FixStore.append(SailTrackerService.this, location);
                }
                Runnable listener = fixListener;
                if (listener != null) listener.run();
            }
        };
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String title = intent != null ? intent.getStringExtra("title") : null;
        String text = intent != null ? intent.getStringExtra("text") : null;
        if (intent != null) intervalMs = Math.max(1000, intent.getLongExtra("intervalMs", 1000));

        Notification notification = buildNotification(
                title != null ? title : "Sail la Vie",
                text != null ? text : "Recording your journey");
        try {
            int type = Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q
                    ? ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION : 0;
            ServiceCompat.startForeground(this, NOTIFICATION_ID, notification, type);
        } catch (Exception e) {
            // Android refused (e.g. location permission was revoked). Nothing
            // useful we can do without it, so shut down cleanly.
            stopSelf();
            return START_NOT_STICKY;
        }
        // Safe to call again when already running: it replaces the existing
        // GPS request rather than adding a second one.
        startUpdates();
        // If Android ever kills the service for memory, ask it to restart it.
        return START_STICKY;
    }

    private void startUpdates() {
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION)
                != PackageManager.PERMISSION_GRANTED) {
            stopSelf();
            return;
        }
        LocationRequest request = new LocationRequest.Builder(Priority.PRIORITY_HIGH_ACCURACY, intervalMs)
                .setMinUpdateIntervalMillis(intervalMs)
                .setMinUpdateDistanceMeters(0f) // sailing includes anchored/drifting stretches; keep recording
                .setWaitForAccurateLocation(false)
                .build();
        try {
            client.removeLocationUpdates(callback);
            client.requestLocationUpdates(request, callback, gpsThread.getLooper());
        } catch (SecurityException e) {
            stopSelf();
        }
    }

    private Notification buildNotification(String title, String text) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                    CHANNEL_ID, "Journey recording", NotificationManager.IMPORTANCE_LOW); // LOW = silent, no buzzing
            channel.setDescription("Shown while Sail la Vie is recording a journey");
            NotificationManager nm = getSystemService(NotificationManager.class);
            if (nm != null) nm.createNotificationChannel(channel);
        }
        // Tapping the notification opens the app.
        PendingIntent openApp = null;
        Intent launch = getPackageManager().getLaunchIntentForPackage(getPackageName());
        if (launch != null) {
            openApp = PendingIntent.getActivity(this, 0, launch,
                    PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        }
        return new NotificationCompat.Builder(this, CHANNEL_ID)
                .setContentTitle(title)
                .setContentText(text)
                .setSmallIcon(android.R.drawable.ic_menu_mylocation)
                .setOngoing(true)
                .setOnlyAlertOnce(true)
                .setCategory(NotificationCompat.CATEGORY_SERVICE)
                .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE)
                .setContentIntent(openApp)
                .build();
    }

    @Override
    public void onDestroy() {
        if (client != null && callback != null) client.removeLocationUpdates(callback);
        if (gpsThread != null) gpsThread.quitSafely();
        instance = null;
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) { return null; }
}
