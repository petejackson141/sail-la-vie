package com.saillavie.app;

import android.os.Bundle;
import android.webkit.WebSettings;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        WebSettings settings = getBridge().getWebView().getSettings();
        settings.setCacheMode(WebSettings.LOAD_NO_CACHE);
        getBridge().getWebView().clearCache(true);
    }
}