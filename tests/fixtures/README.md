# 测试固定数据

- `builds-golden.json`：两套游戏内实机构筑（用户保存的存档），必须始终 0 冲突。
- `parity.json`：从 Python 参考实现生成的黄金对拍向量（915 组 validate/warnings + 150 组 candidates），
  用来保证 JS 规则引擎与参考实现逐条一致。**不要手改**；规则变更后用参考实现重新生成，再跑 `npm run verify`。

`parity.json` 顶层的 `cardsSha256` 必须与 `js/data.js` 的 `cardsSha256` 一致，否则说明卡牌数据或规则已漂移。
