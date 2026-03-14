# GitHub 发布清单

## 发布前建议

1. 确认 `data/` 没有被提交
2. 确认扩展可以在 Edge / Chrome 中正常加载
3. 跑一次 `npm test`
4. 检查 README 是否符合你想公开表达的定位
5. 如果要正式公开，建议补一个 128x128 的扩展图标

## 建议仓库名

- `chatgpt-team-archive`
- `chatgpt-manual-archive`
- `chatgpt-local-archive`

## 推送步骤

```bash
git init -b main
git add .
git commit -m "Initial open-source release"
git remote add origin <你的 GitHub 仓库地址>
git push -u origin main
```

## 仓库可选设置

- 打开 Issues
- 打开 Discussions
- 添加 Topics：`chatgpt`, `browser-extension`, `archive`, `edge-extension`, `chrome-extension`, `productivity`
- 在 GitHub 仓库描述里写：`Manual local-first archive extension for ChatGPT conversations.`
