package com.saillavie.app.tracking;

import android.Manifest;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;

import androidx.core.content.ContextCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

/**
 * The bridge between journey.js and SailTrackerService.
 * In JavaScript it appears as window.Capacitor.Plugins.SailTracker with:
 *   start({title, text, intervalMs})  begin (or keep) recording
 *   stop()                            stop recording and discard the queue
 *   takeFixes()                       -> {fixes:[...]} everything recorded so far, oldest first
 *   restart()                         -> {running} re-request GPS if the service is running
 *   isRunning()                       -> {running}
 *   event "fixesAvailable"            new fixes are waiting in the queue
 *
 * Only asks for "while using the app" location, never "all the time":
 * recording always starts from a button tap, and the foreground service
 * keeps it going from there.
 */
@CapacitorPlugin(
        name = "SailTracker",
        permissions = {
                @Permission(alias = "location", strings = {
                        Manifest.permission.ACCESS_FINE_LOCATION,
                        Manifest.permission.ACCESS_COARSE_LOCATION
                }),
                @Permission(alias = "notifications", strings = {
                        Manifest.permission.POST_NOTIFICATIONS
                })
        }
)
public class SailTrackerPlugin extends Plugin {

    private final Handler mainThread = new Handler(Looper.getMainLooper());

    @Override
    public void load() {
        // The service calls this from its GPS thread; hop onto the main
        // thread before talking to the web side.
        SailTrackerService.setFixListener(() ->
                mainThread.post(() -> notifyListeners("fixesAvailable", new JSObject())));
    }

    @Override
    protected void handleOnDestroy() {
        SailTrackerService.setFixListener(null);
    }

    private boolean hasPreciseLocation() {
        return ContextCompat.checkSelfPermission(getContext(), Manifest.permission.ACCESS_FINE_LOCATION)
                == PackageManager.PERMISSION_GRANTED;
    }

    @PluginMethod
    public void start(PluginCall call) {
        if (!hasPreciseLocation()) {
            requestPermissionForAlias("location", call, "locationPermissionResult");
            return;
        }
        if (Build.VERSION.SDK_INT >= 33 && getPermissionState("notifications") != PermissionState.GRANTED) {
            requestPermissionForAlias("notifications", call, "notificationPermissionResult");
            return;
        }
        startService(call);
    }

    @PermissionCallback
    private void locationPermissionResult(PluginCall call) {
        if (!hasPreciseLocation()) {
            // Includes the case where only "Approximate" was allowed: far too
            // coarse to draw a sailing track with.
            call.reject("Precise location permission was not granted", "PERMISSION_DENIED");
            return;
        }
        start(call); // carries on to the notification check
    }

    @PermissionCallback
    private void notificationPermissionResult(PluginCall call) {
        // Recording works even if notifications were refused; the user just
        // won't see the "Recording" notification. So carry on either way.
        startService(call);
    }

    private void startService(PluginCall call) {
        Intent intent = new Intent(getContext(), SailTrackerService.class);
        intent.putExtra("title", call.getString("title", "Sail la Vie"));
        intent.putExtra("text", call.getString("text", "Recording your journey"));
        intent.putExtra("intervalMs", (long) call.getInt("intervalMs", 1000));
        try {
            ContextCompat.startForegroundService(getContext(), intent);
            call.resolve();
        } catch (Exception e) {
            // e.g. Android 12+ refusing a start while the app is in the background.
            call.reject("Could not start the tracking service: " + e.getMessage(), "START_FAILED");
        }
    }

    @PluginMethod
    public void stop(PluginCall call) {
        getContext().stopService(new Intent(getContext(), SailTrackerService.class));
        FixStore.clear(getContext());
        call.resolve();
    }

    @PluginMethod
    public void takeFixes(PluginCall call) {
        JSObject result = new JSObject();
        result.put("fixes", FixStore.take(getContext()));
        call.resolve(result);
    }

    @PluginMethod
    public void restart(PluginCall call) {
        JSObject result = new JSObject();
        result.put("running", SailTrackerService.restartUpdatesIfRunning());
        call.resolve(result);
    }

    @PluginMethod
    public void isRunning(PluginCall call) {
        JSObject result = new JSObject();
        result.put("running", SailTrackerService.isRunning());
        call.resolve(result);
    }
}
