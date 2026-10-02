package com.fritia.next.chat;

import android.app.Activity;
import android.content.Intent;
import android.content.ClipboardManager;
import android.content.Context;
import android.net.Uri;
import android.util.Base64;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import org.json.JSONObject;
import java.io.OutputStream;
import java.util.Iterator;
import java.util.concurrent.TimeUnit;
import okhttp3.*;

/** WebDAV method fidelity and Storage Access Framework archive saving. */
public final class FritiaArchiveBridge {
    private static final int SAVE_REQUEST = 1902;
    private final Activity activity;
    private final WebView webView;
    private String pickerToken;
    private String writableUri;
    private final OkHttpClient client = new OkHttpClient.Builder()
        .connectTimeout(30, TimeUnit.SECONDS).readTimeout(180, TimeUnit.SECONDS).writeTimeout(180, TimeUnit.SECONDS)
        .followRedirects(false).build();

    public FritiaArchiveBridge(Activity activity, WebView webView) {
        this.activity = activity; this.webView = webView;
        webView.addJavascriptInterface(this, "FritiaArchive");
    }
    private void reply(String token, JSONObject result) {
        activity.runOnUiThread(() -> webView.evaluateJavascript(
            "window.__FRITIA_ARCHIVE_CALLBACK__&&window.__FRITIA_ARCHIVE_CALLBACK__(" + JSONObject.quote(token) + "," + JSONObject.quote(result.toString()) + ")", null));
    }
    private void failure(String token, Exception error) {
        try { reply(token, new JSONObject().put("error", error.getMessage() == null ? error.toString() : error.getMessage())); } catch (Exception ignored) {}
    }
    @JavascriptInterface public void request(String raw) {
        new Thread(() -> {
            String token = "";
            try {
                JSONObject input = new JSONObject(raw); token = input.getString("token");
                HttpUrl url = HttpUrl.parse(input.getString("url"));
                if (url == null) throw new Exception("Invalid WebDAV URL");
                String method = input.optString("method", "GET");
                byte[] bytes = input.isNull("body") ? new byte[0] : Base64.decode(input.optString("body"), Base64.DEFAULT);
                RequestBody body = method.equals("GET") || method.equals("HEAD") ? null : RequestBody.create((MediaType)null, bytes);
                JSONObject headers = input.optJSONObject("headers");
                for (int redirects = 0; redirects <= 5; redirects++) {
                    Request.Builder builder = new Request.Builder().url(url).method(method, body);
                    if (headers != null) for (Iterator<String> it = headers.keys(); it.hasNext();) { String name = it.next(); builder.header(name, headers.getString(name)); }
                    try (Response response = client.newCall(builder.build()).execute()) {
                        if (response.code() == 301 || response.code() == 302 || response.code() == 307 || response.code() == 308) {
                            HttpUrl next = url.resolve(response.header("Location", ""));
                            if (next == null || !next.host().equals(url.host()) || next.port() != url.port() || !next.scheme().equals(url.scheme())) throw new Exception("WebDAV redirect changes origin; use the final server URL");
                            url = next; continue;
                        }
                        JSONObject out = new JSONObject().put("status", response.code()).put("statusText", response.message());
                        JSONObject resultHeaders = new JSONObject();
                        for (String name : response.headers().names()) resultHeaders.put(name, response.header(name));
                        out.put("headers", resultHeaders);
                        out.put("body", Base64.encodeToString(response.body() == null ? new byte[0] : response.body().bytes(), Base64.NO_WRAP));
                        reply(token, out); return;
                    }
                }
                throw new Exception("Too many WebDAV redirects");
            } catch (Exception error) { failure(token, error); }
        }, "fritia-webdav").start();
    }
    @JavascriptInterface public void chooseFile(String raw) {
        activity.runOnUiThread(() -> {
            String token = "";
            try {
                JSONObject input = new JSONObject(raw); token = input.getString("token");
                if (pickerToken != null) throw new Exception("A save dialog is already open");
                pickerToken = token;
                Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE)
                    .setType("application/zip").putExtra(Intent.EXTRA_TITLE, input.getString("filename"));
                activity.startActivityForResult(intent, SAVE_REQUEST);
            } catch (Exception error) { pickerToken = null; failure(token, error); }
        });
    }
    public boolean onActivityResult(int request, int result, Intent data) {
        if (request != SAVE_REQUEST) return false;
        String token = pickerToken; pickerToken = null;
        try {
            writableUri = result == Activity.RESULT_OK && data != null && data.getData() != null ? data.getData().toString() : null;
            reply(token, writableUri == null ? new JSONObject().put("cancelled", true) : new JSONObject().put("uri", writableUri));
        } catch (Exception error) { failure(token, error); }
        return true;
    }
    @JavascriptInterface public void writeFile(String raw) {
        new Thread(() -> {
            String token = "";
            try {
                JSONObject input = new JSONObject(raw); token = input.getString("token");
                String uri = input.getString("uri");
                if (!uri.equals(writableUri)) throw new Exception("No matching user-selected save destination");
                try (OutputStream output = activity.getContentResolver().openOutputStream(Uri.parse(uri), "wt")) {
                    if (output == null) throw new Exception("Cannot write selected file");
                    output.write(Base64.decode(input.getString("body"), Base64.DEFAULT));
                }
                writableUri = null; reply(token, new JSONObject().put("saved", true));
            } catch (Exception error) { failure(token, error); }
        }, "fritia-save-archive").start();
    }
    @JavascriptInterface public void clipboard(String raw) {
        activity.runOnUiThread(() -> {
            String token = "";
            try {
                token = new JSONObject(raw).getString("token");
                ClipboardManager manager = (ClipboardManager)activity.getSystemService(Context.CLIPBOARD_SERVICE);
                String text = manager.hasPrimaryClip() && manager.getPrimaryClip().getItemCount() > 0 ? String.valueOf(manager.getPrimaryClip().getItemAt(0).coerceToText(activity)) : "";
                reply(token, new JSONObject().put("text", text));
            } catch (Exception error) { failure(token, error); }
        });
    }
}
