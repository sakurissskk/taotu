<div align="center">

<img src="docs/banner.svg" alt="陶土词卡" width="880">

# 陶土词卡

**离线英语词汇学习应用** · 10,200 词 · 8 个词书 · 安卓 APK + 单文件 HTML

[下载 APK](https://github.com/sakurissskk/taotu/releases/latest) · [在线试用](https://sakurissskk.github.io/taotu/) · [使用说明](使用说明.md)

</div>

> 暖纸背景、低饱和陶土色与鼠尾草绿的轻量词书。词库全部内嵌，断网可用；学习记录只存在本机。

## 功能

- **今日**：问候语随系统时间变化；右上角显示时间与电量（安卓原生桥）；20 张进度环与学习统计。
- **万词词库**：10,200 词，按 精讲 / 初中 / 高中 / 四级 / 六级 / 考研 / 拓展 / 我的词库 分类；A–Z 首字母筛选、搜索、分页跳页、折叠展开、收藏、笔记。
- **翻卡学习**：15 张一组、随机并避免相邻同首字母；卡片右上角 ★ 收藏；「收藏本」独立分类，可直接翻收藏词。
- **巩固拔高**：练习每轮 10 题（选择题自动判分 + 拼写自评）；错题本支持逐题重写，答对标记「已订正」、答错排到末尾，错题 ★ 单向同步收藏本。
- **我的**：统计与正确率、收藏/错题入口、自定义词库、明暗外观、JSON 备份导出/导入、清空记录、关于。

## 导入自己的词库

「万词词库 → 我的词库」支持三种方式，导入的词与内置词库分开存放、可单独删除：

1. **选文件**：`.txt` / `.csv` / `.json`（UTF-8）；
2. **粘贴**：每行 `word,释义`、`word /音标/ 释义` 或 `word<TAB>释义`，也接受 JSON 数组，最多 5000 条；
3. **按链接**：粘贴 `https://` 直链（安卓版原生请求，浏览器版 `fetch`，需目标允许跨域）。

导入后提示「新增 X 条；重复或无效跳过 Y 条」，重复按小写词形判断。备份 JSON 会一并保存自定义词库。

## 设计

- 暖纸 `#f4ecdf` + 陶土 `#b0603f` + 鼠尾草 `#7c8f6d`，卡片轻磨砂、留白充足；
- 正文系统无衬线，标题与词条用衬线；
- 5 项底部悬浮导航，手机优先，桌面浏览器居中单栏；
- 深色模式跟随系统，也可手动固定；状态栏配色随主题同步（安卓端）。

## 安装

1. 到 [Releases](https://github.com/sakurissskk/taotu/releases/latest) 下载 `taotu-vocab-x.y.z.apk`；
2. 手机点开安装，首次需允许「安装未知应用」；
3. 或者直接打开 `docs/index.html`（或 Release 里的单文件 HTML），浏览器里就能用。

要求 Android 6.0（API 23）及以上；包名 `app.taotu.vocab`。从旧版覆盖安装会保留本机学习记录。

## 内容与来源

- **精讲 90 词**：原创整理，6 个单元各 15 条，含自写例句与解析；**不含真题原文，不标年份与考频**。
- **万词部分**：来自开源词库 [ECDICT](https://github.com/skywind3000/ECDICT)（MIT 许可），按其 `zk/gk/cet4/cet6/ky` 标签分类；释义取中文释义前 3 行、音标取其音标字段。这是词典数据，不是真题，也不代表考频。
- **拓展 2,771 词**：ECDICT 中未带考试标签的高频通用词，页面标注「非考纲」。
- 已剔除纯符号与超长异常项，同词形只保留一条；未收录广告、二维码、公众号或外链。

## 目录结构

```
├── src/                # 前端源码
│   ├── data.json       # 词库（90 精讲 + 10,110 批量 + 词书定义）
│   ├── app.js          # 交互、本地存储、导入导出
│   ├── style.css       # 主题与布局
│   ├── index.template.html
│   └── build_html.py   # 内联成单文件 HTML
├── android/            # 安卓壳（WebView + 文件选择 + 备份/网络桥）
│   ├── AndroidManifest.xml
│   ├── res/  src/  assets/
├── docs/               # GitHub Pages：index.html 在线版 + banner.svg
├── release/            # 已签名 APK
├── build_apk.sh        # 打包脚本
├── 使用说明.md
├── 发布到GitHub-步骤.md
└── LICENSE
```

## 自己构建

需要 JDK 17、Android SDK platform 34、`aapt2` / `zipalign` / `apksigner` / `d8`，以及你自己的签名密钥：

```bash
python3 src/build_html.py

ANDROID_JAR=$HOME/Android/Sdk/platforms/android-34/android.jar \
AAPT2=aapt2 D8=d8 \
TAOTU_KEYSTORE=/path/to/taotu-release.jks \
TAOTU_STORE_PASS=你的口令 \
./build_apk.sh 1.1.1 4        # 版本名、versionCode
```

密钥库与口令**不会**进入本仓库；更新时保持包名与签名不变、递增 `versionCode`，即可覆盖安装并保留本机数据。

## 数据与隐私

- 数据保存在 WebView / 浏览器的 `localStorage`，不上传任何服务器；
- 只有主动「按链接导入」时才联网（安卓需 `INTERNET` 权限）；
- 导出备份为 JSON，安卓端写入 `下载/` 目录；
- 卸载应用或清除应用数据会丢失记录，建议定期导出。

## 已知限制

- 万词释义来自 ECDICT 截断，个别词条可能带生僻义或音标格式不统一；
- 尚未做真机安装回归（已验证签名、包信息、页面逻辑与浏览器排版）；
- 拼写题为自评，不做自动判分；
- 没有账号、云同步或应用内购买——这些都不是本项目的目标。

## 许可证

代码 MIT；精讲词库内容 CC BY-NC 4.0（署名、非商业）；批量词库数据来自 ECDICT（MIT）。详见 [LICENSE](LICENSE)。

## 作者

shirely立 · fkwbk158@gmail.com
