// Official Swagger v2 PurchaseOrderDto and SupplierInfoDto, schema verified.
// Header-only first pass: no nested items expansion or inferred totals/approvals.
export const PURCHASES_CONTRACT=Object.freeze({domain:'purchases',verified:true,version:'purchase-headers-v2-20261023',path:'/purchases/orders/list',idField:'purchaseOrderId',modifiedField:'modifiedAt',maxPageSize:100,fields:['purchaseOrderId','supplier.supplierId','supplier.VATId','issuedDate','dueDate','status','nullDoc','modifiedAt']});
export async function loadPurchaseEvidence(client) {
 return client.sync({domain:'purchases',contract:PURCHASES_CONTRACT,maxPages:5,maxCalls:5,pageSize:100,cacheTtlMs:3600000});
}
