export type ContractPurchaseOrderCandidate = {
  contractNumber: string;
  purchaseOrderNumber: string;
  sourceFile: string;
  sourceFileSha256: string;
  sourceSheet: string;
  sourceCell: string;
  sourceText: string;
};

const SOURCE_FILE = 'Planilla Avance Contratos - Con resumen.xlsx';
const SOURCE_SHA256 = 'b7eb275ec0b86e5867ece489a714c48a09033342403deb65fd719ad9c9c29317';

const rows: Array<[string, string, string, string, string]> = [
  ['IO-01','27712','Control Contrato RPR Fase 1','B9','27712-27714-27752-27754-27755-27756-27756'],
  ['IO-01','27714','Control Contrato RPR Fase 1','B9','27712-27714-27752-27754-27755-27756-27756'],
  ['IO-01','27752','Control Contrato RPR Fase 1','B9','27712-27714-27752-27754-27755-27756-27756'],
  ['IO-01','27754','Control Contrato RPR Fase 1','B9','27712-27714-27752-27754-27755-27756-27756'],
  ['IO-01','27755','Control Contrato RPR Fase 1','B9','27712-27714-27752-27754-27755-27756-27756'],
  ['IO-01','27756','Control Contrato RPR Fase 1','B9','27712-27714-27752-27754-27755-27756-27756'],
  ['IO-01','27757','Control Contrato RPR Fase 1','B117','Fundación torre de ciclones OC-27757'],
  ['IO-02','29501','Control Contrato RPR Fase 1 Mon','B9','29501-29502-29503-29505-29507-28693-29508-29513'],
  ['IO-02','29502','Control Contrato RPR Fase 1 Mon','B9','29501-29502-29503-29505-29507-28693-29508-29513'],
  ['IO-02','29503','Control Contrato RPR Fase 1 Mon','B9','29501-29502-29503-29505-29507-28693-29508-29513'],
  ['IO-02','29505','Control Contrato RPR Fase 1 Mon','B9','29501-29502-29503-29505-29507-28693-29508-29513'],
  ['IO-02','29507','Control Contrato RPR Fase 1 Mon','B9','29501-29502-29503-29505-29507-28693-29508-29513'],
  ['IO-02','28693','Control Contrato RPR Fase 1 Mon','B9','29501-29502-29503-29505-29507-28693-29508-29513'],
  ['IO-02','29508','Control Contrato RPR Fase 1 Mon','B9','29501-29502-29503-29505-29507-28693-29508-29513'],
  ['IO-02','29513','Control Contrato RPR Fase 1 Mon','B9','29501-29502-29503-29505-29507-28693-29508-29513'],
  ['IO-03','27602','RPR Suministro Ss Leasing','B9','27602 / 27604'],
  ['IO-03','27604','RPR Suministro Ss Leasing','B9','27602 / 27604'],
  ['IO-04','27849','Control SL Ingeniería','B9','27849'],
  ['IO-05','27868','Control Contrato Petra','B9','27868'],
  ['IO-05','28099','Control Contrato Petra','B62','28099'],
  ['IO-05','28993','Control Contrato Petra','B89','28993'],
  ['IO-05','28995','Control Contrato Petra','B110','28995'],
  ['IO-06','25669','CONTROL SERV MINERÍA y ENERGÍA ','B9','25669-26770-27751'],
  ['IO-06','26770','CONTROL SERV MINERÍA y ENERGÍA ','B9','25669-26770-27751'],
  ['IO-06','27751','CONTROL SERV MINERÍA y ENERGÍA ','B9','25669-26770-27751'],
  ['IO-06','28072','CONTROL SERV MINERÍA y ENERGÍA ','B36','28072'],
  ['IO-06','28167','CONTROL SERV MINERÍA y ENERGÍA ','B55','28167'],
  ['IO-06','28822','CONTROL SERV MINERÍA y ENERGÍA ','B74','28822'],
  ['IO-07','27091','GEOPHYSICAL STUDIES ','B9','27091'],
  ['IO-07','28402','GEOPHYSICAL STUDIES ','B36','28402'],
  ['IO-08','27865','CONSTRUCTORA 3D SPA','B9','27865-27939-27940-27943-27949-28071'],
  ['IO-08','27939','CONSTRUCTORA 3D SPA','B9','27865-27939-27940-27943-27949-28071'],
  ['IO-08','27940','CONSTRUCTORA 3D SPA','B9','27865-27939-27940-27943-27949-28071'],
  ['IO-08','27943','CONSTRUCTORA 3D SPA','B9','27865-27939-27940-27943-27949-28071'],
  ['IO-08','27949','CONSTRUCTORA 3D SPA','B9','27865-27939-27940-27943-27949-28071'],
  ['IO-08','28071','CONSTRUCTORA 3D SPA','B9','27865-27939-27940-27943-27949-28071'],
  ['IO-09','27574','SPIN TECHNOLOGIES Leasing','B9','27574'],
  ['EP-02','28341','Global Fire','B9','28341'],
  ['EP-03','28399','Sustentable','B9','28399 - 28.488 - 28.489 - 28.490'],
  ['EP-03','28488','Sustentable','B9','28399 - 28.488 - 28.489 - 28.490'],
  ['EP-03','28489','Sustentable','B9','28399 - 28.488 - 28.489 - 28.490'],
  ['EP-03','28490','Sustentable','B9','28399 - 28.488 - 28.489 - 28.490'],
];

export const CONTRACT_PURCHASE_ORDER_CANDIDATES: ContractPurchaseOrderCandidate[] = rows.map(
  ([contractNumber, purchaseOrderNumber, sourceSheet, sourceCell, sourceText]) => ({
    contractNumber,
    purchaseOrderNumber,
    sourceFile: SOURCE_FILE,
    sourceFileSha256: SOURCE_SHA256,
    sourceSheet,
    sourceCell,
    sourceText,
  }),
);
