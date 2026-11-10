# V-Burst VOS API reference

## Addresses and authentication

The VOS web service listens on container port47000. Use the existing VOS origin plus `/app/com.ictrek.motrix-next`, then append the paths below. The package does not map a host port or declare a stable custom host alias. Do not advertise a guessed `motrix-next` address or the desktop extension listener as an installed VOS endpoint. Independent Docker deployments may explicitly publish47000 themselves.

The Node wrapper and bundled aria2 service do not validate VOS Bearer tokens or issue personal API keys. Tasks and downloads belong to the shared application service, not individual VOS users. An arbitrary Authorization header does not establish user ownership. Keep calls within the existing trusted application boundary. V-Scheduler inference/model keys do not authenticate download-manager APIs.

Native aria2 is bound to loopback inside the container on29100; `/jsonrpc` proxies HTTP and WebSocket to it. The shipped launcher does not configure `--rpc-secret`. A separately configured aria2 server can require `token:<secret>` as the first RPC parameter; this is an aria2 RPC secret, not an HTTP Bearer token or a Key-generation API. Do not change an installed user's settings to test examples.

## HTTP endpoints

| Method and path | Request | Response and errors |
| --- | --- | --- |
| GET `/healthz` | No body |200 `text/plain` `ok`; this checks the wrapper, not successful download execution. The exact path is required. |
| GET `/api/runtime-info` | No body |200 JSON `{vosAppVersion:string,image:string,imageVersion:string,profile:string}`; empty fields mean the environment did not provide them. `image` can be a full registry reference. No credentials are returned. |
| GET `/api/path-exists?path=...` | URL-encoded absolute container path |200 JSON `{exists:boolean}`. Paths outside DOWNLOAD_DIR return false. Host paths differ from container paths. False is not an HTTP404 or proof of write permission. |
| POST `/jsonrpc` | JSON-RPC2 body, application/json | Native aria2 response, including JSON-RPC errors with HTTP200 or400. Connection failure returns HTTP502 JSON `{error:string}`. |
| GET `/jsonrpc` with WebSocket upgrade | Standard WebSocket handshake | Native aria2 JSON-RPC frames and notifications. Disconnect does not cancel a download. |

Other requests serve web assets or SPA fallback; an HTML200 is not a valid API response. Check Content-Type before parsing JSON. The wrapper has no generic REST file-upload/download or user-account endpoint.

## JSON-RPC envelope and types

Send `{jsonrpc:"2.0",id:"stable-client-id",method:"aria2.getVersion",params:[]}`. Match responses by id: success has result; failure has error with code/message. A batch is an array of independent request objects. `system.multicall` instead takes an array of `{methodName,params}` and has its own nested success/error results. A request ID correlates a response; it does **not** guarantee idempotent submission. Save the returned gid and query it before retrying an uncertain addUri/addTorrent request.

GIDs are strings. Native byte counters, speeds and many numeric options are decimal strings; do not assume JSON numbers. tellStatus/tellActive/tellWaiting/tellStopped return task objects with gid/status/totalLength/completedLength/downloadSpeed/uploadSpeed and optional files, bittorrent, errorCode/errorMessage, following/followedBy/belongsTo. File items contain index/path/length/completedLength/selected/uris; uri entries contain uri/status. Availability depends on task type and requested keys.

Use `system.listMethods` and `system.listNotifications` to discover the **running engine's** method set. The VOS image installs Debian aria2, while the desktop upstream may use Aria2 Next extensions; desktop commands such as ED2K/media helpers are not automatically supported by this wrapper. The [native RPC reference](https://aria2.github.io/manual/en/html/aria2c.html#rpc-interface) defines standard method-specific option and result fields. Preserve native extensions rather than imposing a Scheduler response envelope.

## Task lifecycle and method catalog

| Method group | Parameters after any configured RPC token | Result |
| --- | --- | --- |
| aria2.addUri | uris:string[], options:object optional, position:integer optional | gid:string; one download may use several mirror URLs |
| aria2.addTorrent | torrent:Base64, uris:string[] optional, options:object optional, position:integer optional | gid:string; binary torrent is encoded in JSON, not multipart |
| aria2.addMetalink | metalink:Base64, options:object optional, position:integer optional | gid:string[] |
| aria2.tellStatus | gid:string, keys:string[] optional | Native task object |
| aria2.tellActive | keys:string[] optional | Task array |
| aria2.tellWaiting / aria2.tellStopped | offset:integer, num:integer, keys:string[] optional | Paged task array; keep pagination bounded |
| aria2.pause / forcePause / unpause | gid:string | gid:string; pause preserves partial files |
| aria2.pauseAll / forcePauseAll / unpauseAll | none | Native status string; affects the shared service |
| aria2.remove / forceRemove | gid:string | gid:string; cancels the task, not a general filesystem delete |
| aria2.getFiles / getUris / getPeers / getServers | gid:string | Native file/URI/peer/server arrays |
| aria2.getOption / changeOption | gid:string, plus options:object for change | Option map / native status string |
| aria2.getGlobalOption / changeGlobalOption | none / options:object | Option map / native status string; only runtime-changeable options apply |
| aria2.changePosition | gid:string, pos:integer, how:string | New position:number |
| aria2.changeUri | gid:string, fileIndex:integer, delUris:string[], addUris:string[], position:integer optional | Native removed/added counts |
| aria2.removeDownloadResult | gid:string | Native status string; removes a finished/stopped result record |
| aria2.purgeDownloadResult | none | Native status string; clears stopped results, not downloaded files |
| aria2.getGlobalStat | none | downloadSpeed/uploadSpeed/numActive/numWaiting/numStopped/numStoppedTotal as strings |
| aria2.getVersion | none | `{version:string,enabledFeatures:string[]}` |
| aria2.getSessionInfo | none | `{sessionId:string}` |
| aria2.saveSession | none | Native status string; persists according to ARIA2_SESSION_FILE |
| aria2.shutdown / forceShutdown | none | Native status string; stops the shared engine, not one task |
| system.listMethods / system.listNotifications | none | string[] |
| system.multicall | calls:object[] | Per-call nested result/error array |

Submit, save the gid, poll tellStatus until complete/error/removed, and inspect errorCode/errorMessage on failures. Download acceptance is not completion. A never-started paused task may disappear immediately after removal, so a later tellStatus can return HTTP400 with a native GID-not-found error; do not insist that every cancellation retains a stopped result. A completed BitTorrent task may continue seeding; pause/remove has different effects from deleting its local data. Polling or WebSocket disconnect is not cancellation. Completed/stopped records can be cleared separately from files. The aria2 session is stored under `/downloads/.aria2/aria2.session`; the browser also has local UI history, which is not the engine's task source of truth.

## Copyable examples

```bash
BASE='http://<vos-host>:<vos-port>/app/com.ictrek.motrix-next'
curl --fail-with-body "$BASE/api/runtime-info"
curl --fail-with-body "$BASE/jsonrpc" -H 'Content-Type: application/json' -d '{"jsonrpc":"2.0","id":"methods","method":"system.listMethods","params":[]}'
# Add paused first; this does not start network transfer.
curl --fail-with-body "$BASE/jsonrpc" -H 'Content-Type: application/json' -d '{"jsonrpc":"2.0","id":"submit-1","method":"aria2.addUri","params":[["https://example.com/file.zip"],{"pause":"true","dir":"/downloads"}]}'
# Replace <gid> with result; error may still be returned with HTTP200.
curl --fail-with-body "$BASE/jsonrpc" -H 'Content-Type: application/json' -d '{"jsonrpc":"2.0","id":"query-1","method":"aria2.tellStatus","params":["<gid>",["gid","status","totalLength","completedLength","errorCode","errorMessage"]]}'
curl --fail-with-body "$BASE/jsonrpc" -H 'Content-Type: application/json' -d '{"jsonrpc":"2.0","id":"cancel-1","method":"aria2.remove","params":["<gid>"]}'
```

## Compatibility and release scope

The API Guide is a separate VOS page and a static `/api-guide.html` asset with quick navigation. No download behavior, identity policy, host mappings, shared directory, RPC secret or scheduler contract changes. Source documentation ships in this app's next release; this documentation task does not publish its image or app package.
