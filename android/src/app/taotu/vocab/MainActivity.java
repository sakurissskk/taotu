package app.taotu.vocab;

import android.app.Activity;
import android.content.ContentValues;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.MediaStore;
import android.util.Log;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.webkit.ValueCallback;
import android.widget.Toast;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

public class MainActivity extends Activity {

    private static final String TAG = "Taotu";
    private static final int REQ_PICK = 42;
    private static final int REQ_FILE = 43;
    private static final int MAX_BACKUP = 4 * 1024 * 1024;
    private WebView web;
    private ValueCallback<Uri[]> fileCallback;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        applyBars(0xFFF4ECDF, true);

        web = new WebView(this);
        web.setBackgroundColor(0xFFF4ECDF);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(true);
        s.setAllowContentAccess(true);
        s.setBuiltInZoomControls(false);
        s.setDisplayZoomControls(false);
        s.setTextZoom(100);
        s.setSupportZoom(false);
        s.setMediaPlaybackRequiresUserGesture(true);
        if (Build.VERSION.SDK_INT >= 26) {
            // 页面自己处理明暗配色，避免系统强制反色
            s.setSafeBrowsingEnabled(false);
        }
        if (Build.VERSION.SDK_INT >= 33) {
            s.setAlgorithmicDarkeningAllowed(false);
        }
        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                return !url.startsWith("file:///android_asset/");
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> cb, FileChooserParams params) {
                if (fileCallback != null) fileCallback.onReceiveValue(null);
                fileCallback = cb;
                try {
                    Intent i = new Intent(Intent.ACTION_GET_CONTENT);
                    i.addCategory(Intent.CATEGORY_OPENABLE);
                    i.setType("*/*");
                    i.putExtra(Intent.EXTRA_MIME_TYPES, new String[]{"text/plain", "text/csv", "application/json", "application/octet-stream"});
                    startActivityForResult(Intent.createChooser(i, "选择词库文件"), REQ_FILE);
                } catch (Exception e) {
                    fileCallback = null;
                    return false;
                }
                return true;
            }
        });
        web.addJavascriptInterface(new Bridge(), "NativeBridge");
        setContentView(web);
        web.loadUrl("file:///android_asset/index.html");
    }

    private void applyBars(int color, boolean lightIcons) {
        Window w = getWindow();
        w.setStatusBarColor(color);
        w.setNavigationBarColor(color);
        View decor = w.getDecorView();
        int flags = decor.getSystemUiVisibility();
        if (Build.VERSION.SDK_INT >= 23) {
            if (lightIcons) flags |= View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR;
            else flags &= ~View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR;
        }
        if (Build.VERSION.SDK_INT >= 26) {
            if (lightIcons) flags |= View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR;
            else flags &= ~View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR;
        }
        decor.setSystemUiVisibility(flags);
    }

    /** 页面配色切换时同步系统栏配色（深色页面对应深色状态栏/浅色图标）。 */
    private class Bridge {
        @JavascriptInterface
        public void setDark(final boolean dark) {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    applyBars(dark ? 0xFF1C1916 : 0xFFF4ECDF, !dark);
                    web.setBackgroundColor(dark ? 0xFF1C1916 : 0xFFF4ECDF);
                }
            });
        }

        @JavascriptInterface
        public String saveBackup(String name, String text) {
            String safe = (name == null || name.trim().isEmpty()) ? "taotu-backup.json" : name.replaceAll("[^A-Za-z0-9._-]", "_");
            try {
                byte[] bytes = text.getBytes(StandardCharsets.UTF_8);
                if (Build.VERSION.SDK_INT >= 29) {
                    ContentValues cv = new ContentValues();
                    cv.put(MediaStore.MediaColumns.DISPLAY_NAME, safe);
                    cv.put(MediaStore.MediaColumns.MIME_TYPE, "application/json");
                    cv.put(MediaStore.MediaColumns.RELATIVE_PATH, "Download");
                    Uri uri = getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, cv);
                    if (uri == null) return "导出失败：无法创建文件";
                    OutputStream os = getContentResolver().openOutputStream(uri);
                    if (os == null) return "导出失败：无法写入";
                    os.write(bytes);
                    os.close();
                    return "已导出到 下载/" + safe;
                } else {
                    File dir = getExternalFilesDir(null);
                    if (dir == null) dir = getFilesDir();
                    File f = new File(dir, safe);
                    FileOutputStream fos = new FileOutputStream(f);
                    fos.write(bytes);
                    fos.close();
                    return "已导出：" + f.getAbsolutePath();
                }
            } catch (Exception e) {
                Log.w(TAG, "saveBackup failed", e);
                return "导出失败：" + e.getMessage();
            }
        }

        @JavascriptInterface
        public void httpGet(final String url) {
            new Thread(new Runnable() {
                @Override
                public void run() {
                    String text = null, err = null;
                    try {
                        if (url == null || !(url.startsWith("http://") || url.startsWith("https://"))) {
                            throw new Exception("只支持 http(s) 链接");
                        }
                        java.net.HttpURLConnection c = (java.net.HttpURLConnection) new java.net.URL(url).openConnection();
                        c.setConnectTimeout(15000);
                        c.setReadTimeout(25000);
                        c.setInstanceFollowRedirects(true);
                        c.setRequestProperty("User-Agent", "Mozilla/5.0 (Linux; Android) Taotu/1.1");
                        c.setRequestProperty("Accept", "text/plain,application/json,*/*");
                        int code = c.getResponseCode();
                        if (code != 200) throw new Exception("HTTP " + code);
                        InputStream in = c.getInputStream();
                        ByteArrayOutputStream bos = new ByteArrayOutputStream();
                        byte[] buf = new byte[8192];
                        int n, total = 0;
                        while ((n = in.read(buf)) > 0) {
                            total += n;
                            if (total > 8 * 1024 * 1024) throw new Exception("文件超过 8MB");
                            bos.write(buf, 0, n);
                        }
                        in.close();
                        text = new String(bos.toByteArray(), StandardCharsets.UTF_8);
                    } catch (Exception e) {
                        err = e.getMessage() == null ? e.toString() : e.getMessage();
                    }
                    final String t = text == null ? "" : text;
                    final String f = err == null ? "" : err;
                    runOnUiThread(new Runnable() {
                        @Override
                        public void run() {
                            web.evaluateJavascript("if(window.__urlResult)window.__urlResult(" + JSONObject.quote(url)
                                    + "," + JSONObject.quote(t) + "," + JSONObject.quote(f) + ")", null);
                        }
                    });
                }
            }).start();
        }

        @JavascriptInterface
        public void pickBackup() {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    try {
                        Intent i = new Intent(Intent.ACTION_OPEN_DOCUMENT);
                        i.addCategory(Intent.CATEGORY_OPENABLE);
                        i.setType("application/json");
                        i.putExtra(Intent.EXTRA_MIME_TYPES, new String[]{"application/json", "text/plain", "*/*"});
                        startActivityForResult(i, REQ_PICK);
                    } catch (Exception e) {
                        Toast.makeText(MainActivity.this, "无法打开文件选择器", Toast.LENGTH_SHORT).show();
                    }
                }
            });
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == REQ_FILE) {
            if (fileCallback != null) {
                Uri u = (resultCode == RESULT_OK && data != null) ? data.getData() : null;
                fileCallback.onReceiveValue(u == null ? null : new Uri[]{u});
                fileCallback = null;
            }
            return;
        }
        if (requestCode != REQ_PICK || resultCode != RESULT_OK || data == null || data.getData() == null) return;
        final Uri uri = data.getData();
        new Thread(new Runnable() {
            @Override
            public void run() {
                try {
                    InputStream in = getContentResolver().openInputStream(uri);
                    ByteArrayOutputStream bos = new ByteArrayOutputStream();
                    byte[] buf = new byte[8192];
                    int n, total = 0;
                    while ((n = in.read(buf)) > 0) {
                        total += n;
                        if (total > MAX_BACKUP) {
                            bos.reset();
                            final String msg = "备份文件超过 4MB";
                            runOnUiThread(new Runnable() {
                                @Override
                                public void run() { Toast.makeText(MainActivity.this, msg, Toast.LENGTH_SHORT).show(); }
                            });
                            return;
                        }
                        bos.write(buf, 0, n);
                    }
                    in.close();
                    final String text = new String(bos.toByteArray(), StandardCharsets.UTF_8);
                    runOnUiThread(new Runnable() {
                        @Override
                        public void run() {
                            web.evaluateJavascript("window.__importText(" + JSONObject.quote(text) + ")", null);
                        }
                    });
                } catch (Exception e) {
                    Log.w(TAG, "read backup failed", e);
                    final String msg = "读取备份失败";
                    runOnUiThread(new Runnable() {
                        @Override
                        public void run() { Toast.makeText(MainActivity.this, msg, Toast.LENGTH_SHORT).show(); }
                    });
                }
            }
        }).start();
    }

    @Override
    public void onBackPressed() {
        if (web != null && web.canGoBack()) {
            web.goBack();
            return;
        }
        super.onBackPressed();
    }

    @Override
    protected void onDestroy() {
        if (web != null) {
            web.removeJavascriptInterface("NativeBridge");
            web.destroy();
            web = null;
        }
        super.onDestroy();
    }
}
