# DSH MCP manager

## 依赖

- Node.js ≥ 24.9.0
- DeepSeek Harness（提供插件运行时、MCP 管理器、Settings、存储与 Web UI 服务）
- `yaml`：2.8.1
- `zod`：4.6.6

## 版本号

1.1.3

## DSH 兼容范围

插件接受 DeepSeek Harness **`>=0.2.2-rc.3 <0.2.3-0`**，适用于提供原生 MCP Manager、Settings、Storage、Sandbox Policy 和 Web Client 服务的配置。隔离集成测试覆盖 npm 发布的 **0.2.2-rc.3、0.2.2-rc.4** 及 Windows Desktop 实装的 **0.2.2-rc.5**。

版本范围也允许之后的 `0.2.2` 预发布和正式版。准入由同一补丁版本内的兼容政策决定，运行验证以上述实测版本为准。`0.2.3` 及其所有预发布版需要重新核对宿主权限、Settings、存储和 Client 接口，再扩展范围。

代理工具执行保存、启停、删除、重置、探测、重连或备注修改时，调用会话必须拥有 Full access。列表和预览保持只读，已认证的 owner 可在界面中管理配置。

## 许可证

[MIT](LICENSE)
