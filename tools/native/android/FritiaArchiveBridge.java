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
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.RejectedExecutionException;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.concurrent.TimeUnit;
import okhttp3.*;

/** WebDAV method fidelity and Storage Access Framework archive saving. */
public final class FritiaArchiveBridge {
    private static final int SAVE_REQUEST = 1902;
    private final Activity activity;
    private final WebView webView;
    private String pickerToken;
    private String writableUri;
    private static final int WRITE_CHUNK_BYTES = 128 * 1024;
    private static final Pattern TOKEN_PATTERN = Pattern.compile("\"token\"\\s*:\\s*\"([a-zA-Z0-9-]{1,80})\"");
    private final Object saveLock = new Object();
    private final ExecutorService writer = Executors.newSingleThreadExecutor(r -> new Thread(r, "fritia-save-archive"));
    private SaveSession activeWrite;
    private volatile boolean closed;
    private static final class SaveSession {
        final String id = UUID.randomUUID().toString();
        final long size;
        OutputStream output;
        long written;
        SaveSession(long size) { this.size = size; }
    }
    private final OkHttpClient client = new OkHttpClient.Builder()
        .connectTimeout(30, TimeUnit.SECONDS).readTimeout(180, TimeUnit.SECONDS).writeTimeout(180, TimeUnit.SECONDS)
        .followRedirects(false).build();

    public FritiaArchiveBridge(Activity activity, WebView webView) {
        this.activity = activity; this.webView = webView;
        webView.addJavascriptInterface(this, "FritiaArchive");
    }
    private void reply(String token, JSONObject result) {
        if (closed) return;
        activity.runOnUiThread(() -> {
            if (!closed && !activity.isFinishing() && !activity.isDestroyed()) webView.evaluateJavascript(
                "window.__FRITIA_ARCHIVE_CALLBACK__&&window.__FRITIA_ARCHIVE_CALLBACK__(" + JSONObject.quote(token) + "," + JSONObject.quote(result.toString()) + ")", null);
        });
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
                synchronized (saveLock) {
                    if (pickerToken != null || activeWrite != null) throw new Exception("A save operation is already active");
                    pickerToken = token;
                }
                Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE)
                    .setType("application/zip").putExtra(Intent.EXTRA_TITLE, input.getString("filename"));
                activity.startActivityForResult(intent, SAVE_REQUEST);
            } catch (Exception error) {
                synchronized (saveLock) { if (token.equals(pickerToken)) pickerToken = null; }
                failure(token, error);
            }
        });
    }
    public boolean onActivityResult(int request, int result, Intent data) {
        if (request != SAVE_REQUEST) return false;
        String token;
        synchronized (saveLock) { token = pickerToken; pickerToken = null; }
        if (token == null) return true;
        try {
            String uri = result == Activity.RESULT_OK && data != null && data.getData() != null ? data.getData().toString() : null;
            synchronized (saveLock) { writableUri = uri; }
            reply(token, uri == null ? new JSONObject().put("cancelled", true) : new JSONObject().put("uri", uri));
        } catch (Exception error) { failure(token, error); }
        return true;
    }
    @JavascriptInterface public void beginWrite(String raw) { saveRequest("begin", raw); }
    @JavascriptInterface public void writeChunk(String raw) { saveRequest("chunk", raw); }
    @JavascriptInterface public void finishWrite(String raw) { saveRequest("finish", raw); }
    @JavascriptInterface public void abortWrite(String raw) { saveRequest("abort", raw); }

    private void saveRequest(String action, String raw) {
        if (closed) return;
        try { writer.execute(() -> {
            String token = "";
            SaveSession session = null;
            try {
                if (raw.length() > ((WRITE_CHUNK_BYTES + 2) / 3) * 4 + 1024) {
                    Matcher match = TOKEN_PATTERN.matcher(raw);
                    if (match.find()) token = match.group(1);
                    throw new Exception("Archive chunk exceeds bridge limit");
                }
                JSONObject input = new JSONObject(raw); token = input.getString("token");
                if (action.equals("begin")) {
                    String uri = input.getString("uri");
                    long size = input.getLong("size");
                    if (size <= 0) throw new Exception("Archive is empty");
                    synchronized (saveLock) {
                        if (activeWrite != null || !uri.equals(writableUri)) throw new Exception("No matching user-selected save destination");
                        session = new SaveSession(size); activeWrite = session; writableUri = null;
                    }
                    session.output = activity.getContentResolver().openOutputStream(Uri.parse(uri), "wt");
                    if (session.output == null) throw new Exception("Cannot write selected file");
                    reply(token, new JSONObject().put("writeId", session.id).put("chunkBytes", WRITE_CHUNK_BYTES));
                    return;
                }
                synchronized (saveLock) {
                    if (activeWrite == null && action.equals("abort")) { reply(token, new JSONObject().put("aborted", true)); return; }
                    if (activeWrite == null || !activeWrite.id.equals(input.getString("writeId"))) throw new Exception("Archive write session does not match");
                    session = activeWrite;
                }
                if (action.equals("abort")) {
                    discardWrite(session); reply(token, new JSONObject().put("aborted", true)); return;
                }
                if (action.equals("chunk")) {
                    if (input.getLong("offset") != session.written) throw new Exception("Archive chunk is out of order");
                    byte[] bytes = Base64.decode(input.getString("body"), Base64.DEFAULT);
                    if (bytes.length == 0 || bytes.length > WRITE_CHUNK_BYTES || bytes.length > session.size - session.written) throw new Exception("Invalid archive chunk size");
                    session.output.write(bytes); session.written += bytes.length;
                    reply(token, new JSONObject().put("written", session.written)); return;
                }
                if (session.written != session.size) throw new Exception("Archive write is incomplete");
                session.output.flush(); session.output.close(); session.output = null;
                synchronized (saveLock) { if (activeWrite == session) activeWrite = null; }
                reply(token, new JSONObject().put("saved", true).put("written", session.written));
            } catch (Exception error) {
                if (session != null) discardWrite(session);
                failure(token, error);
            }
        }); } catch (RejectedExecutionException ignored) { /* Activity destruction raced this call. */ }
    }

    private void discardWrite(SaveSession session) {
        // Close only this writer; never delete a document or touch source data.
        try { if (session.output != null) session.output.close(); } catch (Exception ignored) {}
        session.output = null;
        synchronized (saveLock) { if (activeWrite == session) activeWrite = null; }
    }

    public void close() {
        synchronized (saveLock) { if (closed) return; closed = true; }
        writer.execute(() -> {
            SaveSession session;
            synchronized (saveLock) { session = activeWrite; writableUri = null; }
            if (session != null) discardWrite(session);
        });
        writer.shutdown();
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
