package com.saillavie.app.tracking;

import android.content.Context;
import android.location.Location;

import com.getcapacitor.JSArray;

import org.json.JSONException;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;

/**
 * A simple on-phone queue of GPS fixes: one line of JSON per fix in a private
 * app file. The service adds to it; journey.js empties it (take()).
 * It's a file rather than memory so fixes survive the app being killed.
 */
final class FixStore {
    private static final Object LOCK = new Object();
    private static final String FILE_NAME = "sail_tracker_fixes.jsonl";

    private FixStore() {}

    static void append(Context ctx, Location l) {
        try {
            JSONObject o = new JSONObject();
            o.put("lat", l.getLatitude());
            o.put("lng", l.getLongitude());
            o.put("accuracy", l.hasAccuracy() ? (Object) l.getAccuracy() : JSONObject.NULL);
            o.put("speed", l.hasSpeed() ? (Object) l.getSpeed() : JSONObject.NULL);
            o.put("heading", l.hasBearing() ? (Object) l.getBearing() : JSONObject.NULL);
            o.put("altitude", l.hasAltitude() ? (Object) l.getAltitude() : JSONObject.NULL);
            o.put("timestamp", l.getTime()); // the fix's real GPS time, in ms
            byte[] line = (o.toString() + "\n").getBytes(StandardCharsets.UTF_8);
            synchronized (LOCK) {
                try (FileOutputStream out = ctx.openFileOutput(FILE_NAME, Context.MODE_APPEND)) {
                    out.write(line);
                }
            }
        } catch (JSONException | IOException ignored) {
            // A single lost fix isn't worth crashing the recorder over.
        }
    }

    /** Returns every stored fix, oldest first, and empties the queue. */
    static JSArray take(Context ctx) {
        JSArray fixes = new JSArray();
        synchronized (LOCK) {
            File file = new File(ctx.getFilesDir(), FILE_NAME);
            if (!file.exists()) return fixes;
            try (BufferedReader in = new BufferedReader(
                    new InputStreamReader(new FileInputStream(file), StandardCharsets.UTF_8))) {
                String line;
                while ((line = in.readLine()) != null) {
                    line = line.trim();
                    if (line.isEmpty()) continue;
                    try {
                        fixes.put(new JSONObject(line));
                    } catch (JSONException ignored) {
                        // Skip a half-written line (e.g. phone died mid-write).
                    }
                }
            } catch (IOException ignored) {
            }
            //noinspection ResultOfMethodCallIgnored
            file.delete();
        }
        return fixes;
    }

    static void clear(Context ctx) {
        synchronized (LOCK) {
            //noinspection ResultOfMethodCallIgnored
            new File(ctx.getFilesDir(), FILE_NAME).delete();
        }
    }
}
