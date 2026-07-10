import { PageHeader, Panel } from "../ui/Section";

type FlowStep = {
  title: string;
  status: string;
  detail: string;
};

const dropshipSteps: FlowStep[] = [
  { title: "登记代发", status: "待发货", detail: "登记店铺订单、客户收货信息、供应商、SKU、数量和备注。" },
  { title: "发货单号", status: "已填单号", detail: "物流部填写快递公司和发货单号，订单进入发货安排。" },
  { title: "发货安排", status: "已提货 / 未发走", detail: "供应商确认提货；如果未发走，可退回未发走状态继续处理。" },
  { title: "采购订单", status: "已下采购单", detail: "采购填写采购订单号，成品订单进入采购跟踪。" },
  { title: "成品信息", status: "实时状态", detail: "集中查看成品订单、物流、采购、退货和备注信息。" }
];

const accessorySteps: FlowStep[] = [
  { title: "配件登记", status: "待发货", detail: "登记售后姓名、电话、地址、店铺订单、供应商、品号、商品名称和数量。" },
  { title: "配件发货", status: "快递取走 / 顾客不要了", detail: "填写快递公司和发货单号；顾客不要时直接归档。" },
  { title: "配件信息", status: "实时状态", detail: "集中查看配件订单、发货、退货、备注和最终状态。" }
];

const returnSteps: FlowStep[] = [
  { title: "退货登记", status: "已提交退货", detail: "选择拦截、自行寄回、上门取件、未出单号退款或已出单号未发货退款，填写退货原因、备注和附件。" },
  { title: "退货操作", status: "退回中", detail: "处理退货安排；拦截和已出单号未发货退款会带出原发货单号，自行寄回填写退货单号，未出单号退款直接归档。" },
  { title: "退货收货", status: "退货成功", detail: "确认退货包裹已收货，订单最终回到成品信息或配件信息。" }
];

const supportItems = [
  { title: "供应商库", detail: "供应商名称、简称、联系人、电话、店址和备注。" },
  { title: "商品信息", detail: "物料编码、产品线、系列、SKU、名称和供应商型号。" },
  { title: "店铺信息", detail: "店铺名称、简称、平台、运营和备注。" },
  { title: "快递信息", detail: "快递名称、联系人、地址和备注。" }
];

const noticeItems = [
  { title: "操作记录", detail: "记录提交、修改、删除、退货、采购、发货等关键动作。" },
  { title: "钉钉通知", detail: "同步登记代发、配件登记、退货登记和退货收货。" },
  { title: "飞书通知", detail: "同步发货单号和退货操作。" }
];

function FlowLane({ title, tone, steps }: { title: string; tone: string; steps: FlowStep[] }) {
  return (
    <section className={`flow-lane ${tone}`}>
      <h3>{title}</h3>
      <div className="flow-steps">
        {steps.map((step, index) => (
          <div className="flow-step-wrap" key={step.title}>
            <article className="flow-step-card">
              <strong>{step.title}</strong>
              <span>{step.status}</span>
              <p>{step.detail}</p>
            </article>
            {index < steps.length - 1 ? <div className="flow-arrow" aria-hidden="true">→</div> : null}
          </div>
        ))}
      </div>
    </section>
  );
}

function SupportGrid({ title, items }: { title: string; items: Array<{ title: string; detail: string }> }) {
  return (
    <section className="flow-support-section">
      <h3>{title}</h3>
      <div className="flow-support-grid">
        {items.map((item) => (
          <article className="flow-support-card" key={item.title}>
            <strong>{item.title}</strong>
            <p>{item.detail}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

export function OperationFlowPage() {
  return (
    <>
      <PageHeader title="操作流程" description="查看一件代发系统从登记、发货、采购、退货到信息归档的整体业务流转。" />
      <Panel title="业务总览">
        <div className="flow-overview">
          <div className="flow-overview-node">基础资料</div>
          <div className="flow-overview-arrow">→</div>
          <div className="flow-overview-node">订单登记</div>
          <div className="flow-overview-arrow">→</div>
          <div className="flow-overview-node">发货 / 采购</div>
          <div className="flow-overview-arrow">→</div>
          <div className="flow-overview-node">退货处理</div>
          <div className="flow-overview-arrow">→</div>
          <div className="flow-overview-node">成品信息 / 配件信息</div>
        </div>
      </Panel>
      <Panel title="流程图">
        <div className="operation-flow-page">
          <SupportGrid title="基础资料支撑" items={supportItems} />
          <FlowLane title="成品代发流程" tone="flow-blue" steps={dropshipSteps} />
          <FlowLane title="配件代发流程" tone="flow-green" steps={accessorySteps} />
          <FlowLane title="退货闭环流程" tone="flow-amber" steps={returnSteps} />
          <SupportGrid title="通知与留痕" items={noticeItems} />
        </div>
      </Panel>
    </>
  );
}
