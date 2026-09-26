package com.saillavie.app;

import android.os.Bundle;
import android.webkit.WebSettings;
import com.getcapacitor.BridgeActivity;
import com.saillavie.app.tracking.SailTrackerPlugin;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Our own GPS recorder plugin. Must be registered BEFORE super.onCreate().
        registerPlugin(SailTrackerPlugin.class);
        super.onCreate(savedInstanceState);
        WebSettings settings = getBridge().getWebView().getSettings();
        settings.setCacheMode(WebSettings.LOAD_NO_CACHE);
        getBridge().getWebView().clearCache(true);
    }
}