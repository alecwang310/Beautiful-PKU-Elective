# Beautiful PKU Elective
Beautiful PKU Elective，简称BPE，是用来提高选课效率的userscript。其通过重新写选课网站前端提供了诸多便利的功能和一个美丽的界面。该程序不提供任何刷课，辅助抢课等违反北京大学校规的功能。

BPE通过DOM劫持和CSS重绘，实现选课系统的现代化UI与诸多提升选课便利性的功能。目前BPE只支持桌面端。

## 功能
- 悬浮课程表显示
- 预选时从选课计划中搜索，按学分，是否冲突等筛选
- 一键折叠名字相同的课程
- 预选时高亮冲突课程和超出学分上限的课程
- 更人性化的页面导航
- 重写的表格宽度逻辑
- 现代且美观的设计

## 安装（文件 `dist/Beautiful_pku_elective.js` 安装教程）
安装BPE只需要dist文件夹中的Beautiful_pku_elective.user.js文件。其余文件均为开发相关。安装时只需将其全部复制后粘贴至一个脚本管理器即可。

文件不能直接在浏览器中双击运行，必须借助 **用户脚本管理器**（如 Tampermonkey）来注入到选课网站中。

本脚本与类似功能的PKU-Art安装方式完全相同，详细安装指南请参考PKU-Art的README文件进行安装
[PKU-Art](https://github.com/zhuozhiyongde/PKU-Art/)

## 致谢

会话超时页面（“系统提示”）中的小恐龙游戏来自 Chromium 的离线页面（t-rex runner），
源码取自 [t-rex-runner](https://github.com/wayou/t-rex-runner)，遵循 BSD 协议，
除启动方式外未作改动，见 `src/static/dino.js`。

## 使用须知
选课事关重大，强烈推荐大家在做出最后的选课决定时，关闭脚本并仔细按照原网站显示的信息核对。我会尽量按时维护，修复已知问题，但无法对因该脚本导致的选课事故负责。

目前没有找到方法读取学分上限，因此学分上限需要手动设置。

所有的红色，黄色课程高亮都不是选课网站提供的信息，无法保证一定准确（尽管我已经审查过了，目前没发现问题）。直接尝试预选即可知道是否能预选成功，颜色高亮仅做参考。
为了实现预选列表的搜索和筛选，脚本需要读取当前页面之外的课程，每页一个请求。这些请求会排队、限速发出（一次一个，每页间隔约 0.8 秒，跳转页面时取消），不会在页面刚打开时连续请求，以免被网站的反刷课机制踢出。读取进度显示在搜索框下方的进度条上。

课程表仍从选课结果页面读取，并且只在你点击“刷新”时读取——脚本不会自行发出课程表请求。预选、退选或重新登录之后课程表会变模糊并提示“点击刷新课程表”，点击后读取一次并重绘；没有缓存时也会显示一个空的、模糊的课程表窗口，等待点击刷新。

如果网站返回了“系统提示：您尚未登录或者会话超时”，脚本会立即停止该页面的一切后台读取并在页面顶部提示。若仍反复被踢出，请关闭脚本后再选课。

由于目前只在预选阶段进行过测试，其余界面的显示行为可能有问题，如果发现在某些页面出现显示问题，欢迎在Github上提交issue。

## 开发

### 文件结构

项目用 Vite（`vite-plugin-monkey`）打包为单个用户脚本，源码在 `src/`：

```
src/
  main.js              入口：注入样式，按页面类型编排构建流程
  config.js            常量、列名别名与列匹配（COL、findCol 等）
  state.js             跨模块共享的可变状态（gridModel、pagerState）
  events.js            跨模块信号（重新过滤 pku-refilter）
  router.js            URL → 页面类型识别

  grid/                表格重绘
    enhance.js         将站点表格重排、拆列、折叠，并建立行模型
    filter.js          搜索/筛选，冲突与学分高亮
    fold.js            同名课程折叠动画
    width.js           列宽调度与横向滚动窗格

  ui/                  页面外观
    dom.js             通用小工具（比如打开二级菜单的chevron）
    header.js          顶栏与导航
    hero.js            页面标题区
    notices.js         通知
    footer.js          页脚
    section-heads.js   列表标题与吸顶偏移
    toolbar.js         搜索/筛选工具栏

  utils/               功能模块
    actions.js         后台预选/意愿值
    cache.js           跨页缓存
    net.js             请求闸门：排队、限速、反踢出检测
    pager.js           分页器
    query.js           选课查询表单
    table.js           行模型与解析
    timetable.js       悬浮课程表

  static/              样式
    layout.js          CSS（css`…` 块，构建时压缩为一行）
    styles.js          调色板与 logo
```

构建相关文件：

- `vite.config.js`：用 `vite-plugin-monkey` 打包，并用 LightningCSS 在构建时压缩 CSS、去掉注释（源码注释不会进入产物）。
- `eslint.config.js`：ESLint 配置，`no-undef` 防止跨模块重构时遗漏符号。
- `dist/Beautiful_pku_elective.user.js`：构建产物，安装只需这一份文件。

构建命令：`npm run build`（构建一次）。

### 环境与依赖

**Node.js**：Vite 8 要求 Node.js 20.19+ 或 22.12+。版本过低时 `npm run build` 会提示升级（仍能构建，但建议使用兼容版本）。推荐用 [nvm](https://github.com/nvm-sh/nvm) 安装并切换：

```bash
nvm install 22   # 或 nvm install 20
nvm use 22
```

项目使用 ES Module（`package.json` 中 `"type": "module"`）。

**安装**：`npm install`。所有依赖均为开发依赖（`devDependencies`），脚本最终打包成单个用户脚本，运行时不需要任何 npm 依赖：

- `vite` — 构建工具。
- `vite-plugin-monkey` — 把源码打包为带 `// ==UserScript==` 元数据的用户脚本。
- `eslint` + `@eslint/js` — JavaScript 静态检查（`npm run lint`），`no-undef` 防止跨模块重构遗漏符号。
- `globals` — 为 ESLint 提供浏览器 / Greasemonkey 全局变量。
- `lightningcss` — 构建时压缩 CSS、去掉注释。

欢迎大家提交PR，我在审核后会进行合并。

为了整体视觉效果统一，不要提交由AI进行辅助设计的代码（但是接受由人设计并仔细审计过的AI生成代码）。尽量仿照原先的视觉语言，尽量不要引入新的颜色（如果想加入深色模式当然可以引入新的颜色），而且提交时要尽量保证没有引入任何额外的问题，即使是极其微小的视觉bug。

设计上：不要使用任何图标（PKU标志是唯一例外）。全部hover效果均为瞬间响应，不要设置hover动画，不要设置任何不与核心功能直接绑定的动画。折叠动画动的只是外部盒子的高度，文字的布局不能改变，只是被 overflow: hidden 裁剪。要保证折叠动画顺滑。一定不能使得主界面表格内文字的字体大小不同来控制列宽，所有文字大小必须统一（课程表中可以更改文字大小，字体大小可以随展示宽度改变）。

代码上：函数名尽量长且修饰性强，注释量尽量大，如果由AI生成最好手动将某些具有迷惑性或不清晰的注释进行更改。不要去掉北京大学计算中心的copyright页脚。设计要符合自适应设计的原则，不过只需要考虑桌面端即可，要保证窄窗口下文字仍然可读。

## 许可证

MIT © alecwang