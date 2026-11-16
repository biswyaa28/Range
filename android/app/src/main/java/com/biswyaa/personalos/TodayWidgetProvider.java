package com.biswyaa.personalos;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.widget.RemoteViews;

import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Renders the locally cached Today snapshot. The web app writes it through the
 * AndroidWidget bridge; this provider never makes a network request.
 */
public class TodayWidgetProvider extends AppWidgetProvider {
    public static final String PREFS = "personalos_widget";
    public static final String SNAPSHOT_KEY = "snapshot";

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] appWidgetIds) {
        for (int id : appWidgetIds) {
            manager.updateAppWidget(id, buildViews(context));
        }
    }

    static void updateAll(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        ComponentName component = new ComponentName(context, TodayWidgetProvider.class);
        int[] ids = manager.getAppWidgetIds(component);
        for (int id : ids) {
            manager.updateAppWidget(id, buildViews(context));
        }
    }

    private static RemoteViews buildViews(Context context) {
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_today);

        Intent launch = new Intent(context, MainActivity.class);
        launch.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent pending = PendingIntent.getActivity(
            context,
            0,
            launch,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        views.setOnClickPendingIntent(R.id.widget_today_title, pending);
        views.setOnClickPendingIntent(R.id.widget_today_body, pending);

        String body = context.getString(R.string.widget_today_empty);
        SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        String raw = prefs.getString(SNAPSHOT_KEY, null);
        if (raw != null) {
            body = render(raw, body);
        }
        views.setTextViewText(R.id.widget_today_body, body);
        return views;
    }

    private static String render(String raw, String fallback) {
        try {
            JSONObject snapshot = new JSONObject(raw);
            StringBuilder out = new StringBuilder();
            JSONArray blocks = snapshot.optJSONArray("blocks");
            if (blocks != null) {
                for (int index = 0; index < blocks.length(); index++) {
                    JSONObject block = blocks.optJSONObject(index);
                    if (block == null) continue;
                    if (out.length() > 0) out.append('\n');
                    out.append(block.optString("start", "")).append("  ")
                        .append(block.optString("title", ""));
                }
            }

            JSONArray tasks = snapshot.optJSONArray("tasks");
            if (tasks != null && tasks.length() > 0) {
                if (out.length() > 0) out.append("\n\n");
                out.append("Due today");
                for (int index = 0; index < tasks.length(); index++) {
                    JSONObject task = tasks.optJSONObject(index);
                    if (task == null) continue;
                    out.append('\n').append("• ").append(task.optString("title", ""));
                }
            }
            return out.length() == 0 ? fallback : out.toString();
        } catch (Exception ignored) {
            return fallback;
        }
    }
}
