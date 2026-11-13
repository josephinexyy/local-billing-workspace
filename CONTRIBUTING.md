# Contributing

欢迎提交问题和改进建议。请说明使用场景、预期行为及复现步骤，只使用虚构数据。

修改金额、编号、收款、取消或导入规则时，请运行 `node tests/core.cjs`，并说明行为变化。修改源代码后，运行 `python3 scripts/build-offline.py` 更新离线版本，核对 PDF 与语言切换。

不要提交真实账本、客户证件、公司银行资料、印章、签名或凭据。保留第三方授权文件。提交的新贡献按项目 MIT License 提供。
