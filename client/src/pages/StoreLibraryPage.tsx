import { FormEvent, useState } from "react";
import { PageHeader, Panel } from "../ui/Section";

type StoreRecord = {
  id: number;
  name: string;
  platform: string;
  owner: string;
  note: string;
};

export function StoreLibraryPage() {
  const [stores, setStores] = useState<StoreRecord[]>([]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setStores((current) => [
      {
        id: Date.now(),
        name: String(form.get("name") ?? ""),
        platform: String(form.get("platform") ?? ""),
        owner: String(form.get("owner") ?? ""),
        note: String(form.get("note") ?? "")
      },
      ...current
    ]);
    event.currentTarget.reset();
  }

  return (
    <>
      <PageHeader title="店铺库" description="维护代发业务涉及的店铺、平台和负责人信息。" />
      <div className="two-column">
        <Panel title="新增店铺">
          <form className="form-grid" onSubmit={submit}>
            <input name="name" placeholder="店铺名称" required />
            <input name="platform" placeholder="平台，如淘宝/拼多多/抖店" required />
            <input name="owner" placeholder="负责人" />
            <textarea name="note" placeholder="备注" />
            <button className="primary-button">新增店铺</button>
          </form>
        </Panel>
        <Panel title="店铺列表">
          <table>
            <thead>
              <tr>
                <th>店铺</th>
                <th>平台</th>
                <th>负责人</th>
                <th>备注</th>
              </tr>
            </thead>
            <tbody>
              {stores.map((store) => (
                <tr key={store.id}>
                  <td>{store.name}</td>
                  <td>{store.platform}</td>
                  <td>{store.owner}</td>
                  <td>{store.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      </div>
    </>
  );
}
