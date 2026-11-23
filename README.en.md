# DSH MCP Manager

[简体中文](./README.md) | English

`dsh-mcp-manager` adds an **MCP servers** panel to the DeepSeek Harness (DSH) sidebar along with the `mcp_servers_manage` Agent tool. Use it when you prefer a structured form over editing YAML by hand to configure remote Streamable HTTP or local stdio MCP servers, inspect generated configurations before saving, and manage server connections.

## Install the plugin

1. Open **Plugins → Add plugin** in your DSH application.
2. Choose the Git source and enter:

```text
github:null0xfff/dsh-mcp-manager
```

After installing and enabling the plugin, open **MCP servers** from the sidebar. Settings are saved through DSH's native Settings API and apply to all sessions in the current profile; server notes are persisted separately per profile.

## First run (read-only preview walkthrough)

This walkthrough does not save any configuration or connect to a server:

1. Click **Add server**.
2. Enter `demo-http` as the server name.
3. Select **HTTP** and enter `https://example.invalid/mcp` as the endpoint (a reserved domain used here strictly for demonstration).
4. Leave **Enable connection after saving** turned off.
5. Click **Check & preview** and expand the read-only preview to inspect the generated configuration.
6. Click **Cancel** to finish the walkthrough without saving.

## Working with real servers

When configuring a real server, these three actions have distinct effects:

- **Check & preview**: The form checks the inputs, then the DSH host generates a read-only configuration preview.
- **Save server**: Persists the configuration via DSH native Settings for all sessions in the current profile. If **Enable connection after saving** is on, DSH also attempts to connect.
- **Test connection**: Performs an actual MCP handshake and fetches the server's tool list. For a local **stdio** server, testing the connection may launch the configured executable.

When configuring a **stdio** server, enter the executable and its arguments separately, with **one argument per line**.

## Credentials and supported transports

- **Credential references**: Headers and environment variables accept existing DSH credential references such as `Bearer ${credential:MCP_TOKEN}`. The plugin does not create credential records.
- **Plaintext warning**: Any plaintext secret entered directly into the form may be stored in the profile configuration, even when masked in the preview.
- **Supported transports**: **Streamable HTTP** and **stdio** only. Legacy SSE and interactive OAuth are not supported.

On hosts that expose the native setting, select **Load tools on demand** under advanced settings to let agents load the tools when needed. Clear it for eager loading.

Edit existing OAuth connections and manage authorization in native DSH settings. The panel displays status and can toggle the connection. Form saves, imports and agent writes refuse to overwrite an OAuth connection.

## Permissions

The plugin enforces separate permission boundaries for the UI and the Agent tool:

- **UI permissions**: Only an authenticated `owner` can manage server configurations through the UI; `viewer` requests to the management endpoint receive `403`.
- **Agent tool (`mcp_servers_manage`)**:
  - **Read-only actions**: `list` and `preview`.
  - **Mutating and connection actions**: `save`, `toggle` (set `enabled` to `true` or `false`), `remove`, `reset`, `probe`, `restart`, and `note` all require an explicit calling session with **Full access**. Calls without a session or without verifiable Full access are rejected.

## Compatibility and verification

- **Version**: `1.1.4`
- **Node.js**: `>=24.9.0`
- **DSH compatibility**: `>=0.2.2-rc.3 <0.2.3-0 || 0.2.3-alpha.2`
  - **Verified**: Host loading, `owner`/`viewer` access control, configuration writes, note persistence, and client registration were verified on `0.2.2-rc.3`, `0.2.2-rc.4`, and `0.2.2-rc.5`.
  - **Policy**: The existing `0.2.2` range remains open. The `0.2.3` line admits exactly `0.2.3-alpha.2`, verified on Windows Desktop.
- **Runtime dependencies**: `yaml` `2.8.1`, `zod` `4.6.6`.

For development verification, run from the repository root:

```sh
pnpm install --frozen-lockfile
pnpm test
```

## License

[MIT](./LICENSE)