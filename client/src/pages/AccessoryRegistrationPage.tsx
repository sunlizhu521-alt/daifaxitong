import { OrderEntryPage } from "./OrdersPage";

export function AccessoryRegistrationPage() {
  return (
    <OrderEntryPage
      title="配件登记"
      description="登记配件订单、识别收货信息、Excel 批量导入并维护后续流程。"
      panelTitle="新增配件"
      submitLabel="登记配件"
      itemInputMode="manual"
      receiverNameLabel="售后姓名"
      receiverPhoneLabel="售后电话"
      addressLabel="收货地址"
    />
  );
}
