# 把「陶土词卡」发布到 GitHub · 分步操作

> 目标：仓库里放源码和说明，Release 里放 APK，GitHub Pages 提供在线试用。
> 全程不需要命令行也能完成（方式 A）；习惯终端就用方式 B。

## 0. 先记住三条底线

1. **绝对不要上传签名密钥**：`taotu-release.jks` / `*.keystore` 和口令只留在你自己电脑。仓库里的 `.gitignore` 已经排除它们，但用网页上传时别手动拖进去。
2. **APK 可以上传**：45 KB，远小于 GitHub 单文件 25 MB 限制；但建议放在 Release，而不是塞进 git 历史。
3. 应用「关于」页里的邮箱 `fkwbk158@gmail.com` 会随页面公开，这是你主动提供的；如果不想公开，先改 `src/data.json` 的 `meta.contact` 再重新打包。

## 1. 准备材料

`Download/taotu-github/`（或 `taotu-github.zip` 解压后）应当是这样：

```
README.md              项目首页
LICENSE                MIT（代码）+ CC BY-NC（词库内容）
CHANGELOG.md           版本记录
使用说明.md             用户手册
.gitignore             排除构建产物与密钥
build_apk.sh           打包脚本
src/                   前端源码（data.json / app.js / style.css / 模板 / 构建脚本）
android/               安卓壳工程（Manifest / res / src / assets）
docs/                  Pages 站点：index.html（单文件应用）、banner.svg、.nojekyll
release/               已签名 APK：taotu-vocab-1.0.1.apk
```

先确认里面**没有** `android/keys/`、`*.jks`、`*.idsig`、`android/build/`。

## 2. 建仓库

1. 登录 GitHub → 右上角 **+** → **New repository**。
2. Repository name 填 `taotu-vocab`（可换）。
3. 选 **Public**（Pages 免费版需要公开仓库；不想公开就跳过 Pages 那步）。
4. **不要**勾选 Add a README / .gitignore / license（我们已经有文件）。
5. **Create repository**。记下地址：`https://github.com/你的用户名/taotu-vocab`。

## 3. 上传文件

### 方式 A：网页拖拽（零命令行）

1. 在新仓库页面点 **uploading an existing file**（或 Add file → Upload files）。
2. 打开本地解压后的文件夹，**全选其中的文件和文件夹**（`README.md`、`src`、`android`、`docs`、`release`、`.gitignore` 等），拖进浏览器上传区。
   - 目录结构会被保留；如果拖完看不到 `src/app.js` 这类子路径，说明拖的是外层文件夹，删掉重拖里面的内容。
   - 以点开头的 `.gitignore` 可能被系统隐藏，按 `Ctrl+H`（macOS `Cmd+Shift+.`）显示后再拖。
3. 底部 Commit changes 填 `feat: 陶土词卡 1.0.1`，点 **Commit changes**。

### 方式 B：命令行（推荐，后续更新省事）

先装 Git：Windows 用 [Git for Windows](https://git-scm.com/download/win)，macOS 执行 `xcode-select --install`，Linux `sudo apt install git`。

```bash
# 只做一次
git config --global user.name  "shirely立"
git config --global user.email "fkwbk158@gmail.com"

cd 你解压后的文件夹
git init
git add .
git commit -m "feat: 陶土词卡 1.0.1"
git branch -M main
git remote add origin https://github.com/你的用户名/taotu-vocab.git
git push -u origin main
```

推送时会要账号密码：**GitHub 不接受登录密码**，密码处填 Personal Access Token：
GitHub 右上头像 → Settings → Developer settings → Personal access tokens → **Tokens (classic)** → Generate new token → 勾选 `repo` → 生成后复制，粘贴到密码位置。
（也可以配置 SSH key，一次配好长期免密。）

推送前先 `git status` 确认列表里没有 `*.jks`：

```bash
git status --short | grep -i jks || echo "干净，没有密钥"
```

## 4. 发布 APK 到 Release

1. 仓库页右侧 **Releases** → **Create a new release**（或 Draft a new release）。
2. **Choose a tag** 输入 `v1.0.1` → 点 **Create new tag on publish**。
3. Release title 填 `陶土词卡 1.0.1`。
4. 描述可直接抄 `CHANGELOG.md` 里 1.0.1 的两条。
5. 把 `release/taotu-vocab-1.0.1.apk` 拖到 **Attach binaries** 区域，等上传完成。
6. **Publish release**。之后 README 顶部的「下载 APK」链接（改成你的用户名后）就能直达。

## 5. 开启在线试用（GitHub Pages）

1. 仓库 **Settings** → 左侧 **Pages**。
2. Build and deployment → Source 选 **Deploy from a branch**。
3. Branch 选 `main`，目录选 **/docs**，Save。
4. 等 1–2 分钟，访问 `https://你的用户名.github.io/taotu-vocab/`。
   - 出现 404：确认 `docs/index.html` 存在、分支/目录没选错；本项目已放 `.nojekyll`，不会被 Jekyll 处理掉。
5. 把 `README.md` 里的 `YOUR-USERNAME` 全部替换成你的用户名，commit 一次。

## 6. 以后更新版本

1. 改 `src/data.json`（词条/单元/作者信息）或 `src/app.js`、`src/style.css`。
2. 升版本：`android/AndroidManifest.xml` 里 `versionCode` 加 1、`versionName` 改成新号（例如 1.0.2 / 3）。
3. 重新构建：

   ```bash
   python3 src/build_html.py
   ANDROID_JAR=... AAPT2=aapt2 D8=d8 \
   TAOTU_KEYSTORE=/你的密钥路径/taotu-release.jks TAOTU_STORE_PASS=口令 \
   ./build_apk.sh
   ```

   生成的 APK 在 `release/`，用同一把密钥签名，老用户可覆盖安装且保留学习记录。
4. `git add . && git commit -m "release: 1.0.2" && git push`。
5. 新建 Release，打 tag `v1.0.2`，上传新 APK。

## 7. 常见问题

| 现象 | 原因 / 处理 |
| --- | --- |
| `remote: Support for password authentication was removed` | 密码位置要填 Personal Access Token，不是 GitHub 登录密码 |
| Pages 打开是 404 | 分支或目录选错；确认是 `main` + `/docs`，文件名为 `index.html` |
| 上传后目录变平 | 网页上传要拖「文件夹里面的内容」，不是外层文件夹；也可用 `git` 推送 |
| 手机提示「未安装应用」 | 允许浏览器/文件管理器「安装未知应用」；确认下载完整（约 45 KB） |
| 想撤销某次提交 / 删掉误传的密钥 | 立刻在 GitHub 删除文件并**更换密钥重新签名**；密钥一旦公开就视为泄露 |
| 仓库体积想更小 | APK 只放 Release，不提交 `release/`（当前为了省事保留了 45 KB，问题不大） |

## 8. 建议的仓库设置（可选）

- **About**：Description 填「离线英语词汇学习应用 · 90 词 · 安卓 APK + 单文件 HTML」，Topics 加 `android` `vocabulary` `offline` `webview`。
- **Social preview**：上传 `docs/banner.svg` 导出的 PNG（1280×640）更好看。
- **Issues**：保留开启，方便收反馈。
