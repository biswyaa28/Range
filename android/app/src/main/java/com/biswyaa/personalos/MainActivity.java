package com.biswyaa.personalos;

import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.os.Bundle;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;

import org.json.JSONObject;

import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import com.getcapacitor.BridgeActivity;

/**
 * Edge-to-edge for target SDK 36: the WebView is padded by the system bar and
 * IME insets so no content is ever drawn under the bars, and the same insets
 * are exposed to CSS as --safe-top / --safe-bottom / --safe-left / --safe-right
 * because env(safe-area-inset-*) is unreliable in the Android WebView.
 */
public class MainActivity extends BridgeActivity {
    private WebView webView;
    private String pendingSharedText;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);

        webView = getBridge().getWebView();
        pendingSharedText = sharedText(getIntent());
        getWindow().setStatusBarColor(Color.TRANSPARENT);
        getWindow().setNavigationBarColor(Color.TRANSPARENT);
        webView.addJavascriptInterface(new ChromeBridge(), "AndroidInsets");
        webView.addJavascriptInterface(new NativeBridge(), "AndroidWidget");

        ViewCompat.setOnApplyWindowInsetsListener(webView, (view, windowInsets) -> {
            Insets bars = windowInsets.getInsets(
                WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout());
            Insets ime = windowInsets.getInsets(WindowInsetsCompat.Type.ime());
            int bottom = Math.max(bars.bottom, ime.bottom);
            view.setPadding(bars.left, bars.top, bars.right, bottom);

            float density = getResources().getDisplayMetrics().density;
            String script = "document.documentElement.style.setProperty('--safe-top','"
                + (bars.top / density) + "px');"
                + "document.documentElement.style.setProperty('--safe-bottom','"
                + (bottom / density) + "px');"
                + "document.documentElement.style.setProperty('--safe-left','"
                + (bars.left / density) + "px');"
                + "document.documentElement.style.setProperty('--safe-right','"
                + (bars.right / density) + "px');";
            webView.evaluateJavascript(script, null);
            return windowInsets;
        });
        ViewCompat.requestApplyInsets(webView);
    }

    @Override
    public void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        pendingSharedText = sharedText(intent);
        if (pendingSharedText != null && webView != null) {
            String script = "window.dispatchEvent(new CustomEvent('personalos:share-text',{detail:"
                + JSONObject.quote(pendingSharedText) + "}))";
            webView.post(() -> webView.evaluateJavascript(script, null));
            pendingSharedText = null;
        }
    }

    private static String sharedText(Intent intent) {
        if (intent == null || !Intent.ACTION_SEND.equals(intent.getAction())) return null;
        String type = intent.getType();
        if (type == null || !type.startsWith("text/")) return null;
        String text = intent.getStringExtra(Intent.EXTRA_TEXT);
        if (text == null) return null;
        String trimmed = text.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }

    /** Bridges that need a Context or must touch the UI thread. */
    private final class NativeBridge {
        @JavascriptInterface
        public String consumeSharedText() {
            String text = pendingSharedText;
            pendingSharedText = null;
            return text;
        }

        @JavascriptInterface
        public void updateSnapshot(String json) {
            if (json == null || json.length() > 64_000) return;
            try {
                new JSONObject(json);
            } catch (Exception ignored) {
                return;
            }
            SharedPreferences prefs = getSharedPreferences(TodayWidgetProvider.PREFS, MODE_PRIVATE);
            prefs.edit().putString(TodayWidgetProvider.SNAPSHOT_KEY, json).apply();
            TodayWidgetProvider.updateAll(MainActivity.this);
        }
    }

    /** Keeps the empty inset strips in step with the in-app theme. */
    private final class ChromeBridge {
        @JavascriptInterface
        public void setChrome(String background, boolean dark) {
            runOnUiThread(() -> {
                int color;
                try {
                    color = Color.parseColor(background);
                } catch (IllegalArgumentException error) {
                    color = dark ? Color.parseColor("#0A0A0B") : Color.parseColor("#F5F5F7");
                }
                getWindow().getDecorView().setBackgroundColor(color);
                new WindowInsetsControllerCompat(getWindow(), getWindow().getDecorView())
                    .setAppearanceLightStatusBars(!dark);
                new WindowInsetsControllerCompat(getWindow(), getWindow().getDecorView())
                    .setAppearanceLightNavigationBars(!dark);
            });
        }
    }
}
