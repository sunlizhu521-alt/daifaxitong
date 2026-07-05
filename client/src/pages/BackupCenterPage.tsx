import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type BackupStatus } from "../api";
import { PageHeader, Panel } from "../ui/Section";

function formatTime(value?: string) {
  if (!value) return "-";
  return new Date(value).toLocaleString();
}

function formatBytes(value?: number) {
  const bytes = Number(value ?? 0);
  if (!bytes) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function BackupCenterPage() {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["backup-status"],
    queryFn: () => api<BackupStatus>("/backups")
  });
  const backupNow = useMutation({
    mutationFn: () => api<BackupStatus>("/backups/run", { method: "POST", notify: true }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["backup-status"] })
  });

  return (
    <>
      <PageHeader title="备份中心" description="系统每天 00:00 自动备份一次，最新备份会覆盖上一份备份。" />
      <div className="two-column catalog-layout">
        <Panel title="自动备份">
          <div className="detail-list">
            <div><span>备份频率</span><strong>每天 00:00</strong></div>
            <div><span>保留方式</span><strong>只保留最新一份，自动覆盖旧备份</strong></div>
            <div><span>备份内容</span><strong>SQLite 数据库、上传附件</strong></div>
            <div><span>下次备份时间</span><strong>{formatTime(data?.nextRunAt)}</strong></div>
          </div>
          <button type="button" className="primary-button" onClick={() => backupNow.mutate()} disabled={backupNow.isPending}>
            {backupNow.isPending ? "正在备份..." : "立即备份"}
          </button>
          {backupNow.error ? <div className="error">{backupNow.error.message}</div> : null}
        </Panel>
        <Panel title="最新备份">
          {data?.exists ? (
            <table>
              <tbody>
                <tr>
                  <th>备份时间</th>
                  <td>{formatTime(data.createdAt)}</td>
                </tr>
                <tr>
                  <th>触发方式</th>
                  <td>{data.triggeredBy === "auto" ? "自动备份" : "手动备份"}</td>
                </tr>
                <tr>
                  <th>数据库文件</th>
                  <td>{data.databaseFile}</td>
                </tr>
                <tr>
                  <th>上传附件</th>
                  <td>{data.uploadsCopied ? "已备份" : "暂无上传附件"}</td>
                </tr>
                <tr>
                  <th>文件数量</th>
                  <td>{data.fileCount}</td>
                </tr>
                <tr>
                  <th>备份大小</th>
                  <td>{formatBytes(data.totalBytes)}</td>
                </tr>
              </tbody>
            </table>
          ) : (
            <div className="success">暂无备份记录，可点击立即备份生成第一份备份。</div>
          )}
        </Panel>
      </div>
    </>
  );
}
