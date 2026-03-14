# ChatGPT Team Archive

[English](README.en.md)

一个面向 ChatGPT 网页版的手动归档扩展。

它解决的核心问题很简单：当你的 ChatGPT 账号在团队空间里，而团队空间又可能突然失效、被移除或无法访问时，你可以把重要聊天手动保存到自己的浏览器本地，后续继续查看、搜索、改名、删除和导出。

## 这是什么

当前主版本是纯扩展方案，不需要本地 Node.js 服务，不需要数据库，也不需要命令行常驻进程。

你只需要：

1. 在 Edge / Chrome 里加载扩展
2. 打开 ChatGPT 会话
3. 点击 `记录当前聊天`
4. 在扩展内置的归档查看器里浏览、搜索、改名、删除和导出 Markdown

## 功能

- 仅手动归档，不会自动扫描普通对话
- 同一会话支持重复记录，只追加新消息
- 归档名称支持自定义修改
- 保留原始标题，展示时优先使用自定义归档名
- 本地查看器支持搜索项目名、标题和消息内容
- 支持导出单条会话 Markdown
- 支持导出整组归档 Markdown
- 支持删除单条归档
- 支持删除整组归档

## 隐私与数据存储

- 所有归档默认保存在当前浏览器的扩展本地存储中
- 不上传到第三方服务器
- 不依赖 OpenAI 官方导出能力
- 删除扩展、清空浏览器扩展数据、切换浏览器配置时，本地归档可能丢失

如果你希望长期保存，建议定期把重要归档导出成 Markdown。

## 适用场景

- 你加入的是别人的 ChatGPT 团队空间
- 你担心团队空间被封禁、移除、或管理员取消你的访问权限
- 你希望把项目对话保存在自己手里
- 你只需要“保存、查看、导出”，不需要回写到 ChatGPT

## 快速开始

详细步骤见 [SETUP.md](SETUP.md)。

最短路径：

1. 打开 Edge 或 Chrome 的扩展管理页
2. 开启“开发者模式”
3. 选择“加载已解压的扩展程序”
4. 选择 `apps/extension`
5. 打开 ChatGPT 页面并刷新一次
6. 点开扩展，读取当前聊天并手动记录

## 项目结构

```text
apps/
  extension/
    manifest.json
    popup.html
    popup.js
    background.js
    content-script.js
    archive.html
    archive.js
    archive.css
docs/
  README.zh-CN.md
  README.en.md
  SETUP.md
```

仓库里还保留了一些早期的本地服务原型目录，当前主流程不依赖它们。

## 开发

这个项目当前没有构建步骤，直接修改扩展源码即可。

基本检查：

```bash
npm test
```

或者：

```bash
node --check apps/extension/background.js
node --check apps/extension/content-script.js
node --check apps/extension/popup.js
node --check apps/extension/archive.js
```

## 分享给别人使用

最简单的方法是把 `apps/extension` 打包成 zip 发给对方。

对方解压后：

1. 打开浏览器扩展页
2. 开启开发者模式
3. 选择“加载已解压的扩展程序”
4. 选择扩展目录

## 限制

- 当前依赖 ChatGPT 网页结构，网页大改版时可能需要适配
- 数据默认只存在本机当前浏览器
- 暂未实现跨设备同步
- 暂未实现导入 / 导出全部归档数据库

## Roadmap

- 全量归档导出 / 导入
- 回收站与误删恢复
- 更稳的页面结构适配
- 更细粒度的导出格式

## License

MIT
