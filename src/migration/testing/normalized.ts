import type { ImportInput } from "@/application/migration-ports";
/** Hand-specified normalized input; independent of the spreadsheet adapter. */
export function syntheticImport(householdId: string, ownerA: string, ownerB: string): ImportInput {
  const base = (sourceKey: string) => ({sourceKey,sourceKind:"synthetic"});
  return {
    mapping:{householdId,owners:{a:ownerA,b:ownerB},classifications:{assetClass:{asset:{normalizedLabel:"Synthetic Asset"}},customGroup:{group:{normalizedLabel:"Synthetic Group"}}}},
    dataset:{datasetId:"synthetic-migration-v1",scopes:[{...base("all"),investmentKeys:["a","b","c"]}],expectations:[],records:[
      {...base("a"),kind:"investment",name:"Synthetic Amber",ownerKeys:["a","b"],classifications:{assetClass:"asset"},customGroupKeys:["group"],status:"active",closedOn:null},
      {...base("b"),kind:"investment",name:"Synthetic Birch",ownerKeys:["b"],classifications:{},customGroupKeys:[],status:"active",closedOn:null},
      {...base("c"),kind:"investment",name:"Synthetic Cedar",ownerKeys:["a"],classifications:{assetClass:"asset"},customGroupKeys:[],status:"closed",closedOn:"2026-01-01"},
      {...base("ca"),kind:"contribution",investmentKey:"a",effectiveDate:"2025-01-01",amount:"100"},
      {...base("cb"),kind:"contribution",investmentKey:"b",effectiveDate:"2025-01-01",amount:"50"},
      {...base("cc"),kind:"contribution",investmentKey:"c",effectiveDate:"2025-01-01",amount:"10"},
      {...base("wa"),kind:"withdrawal",investmentKey:"a",effectiveDate:"2025-07-01",amount:"20"},
      {...base("wc"),kind:"withdrawal",investmentKey:"c",effectiveDate:"2026-01-01",amount:"12"},
      {...base("t"),kind:"transfer",sourceInvestmentKey:"a",destinationInvestmentKey:"b",effectiveDate:"2025-08-01",amount:"5"},
      {...base("va0"),kind:"valuation",investmentKey:"a",asOfDate:"2025-01-01",grossValue:"100",debt:"0"},
      {...base("vb0"),kind:"valuation",investmentKey:"b",asOfDate:"2025-01-01",grossValue:"50",debt:"0"},
      {...base("vc0"),kind:"valuation",investmentKey:"c",asOfDate:"2025-01-01",grossValue:"10",debt:"0"},
      {...base("va"),kind:"valuation",investmentKey:"a",asOfDate:"2026-01-01",grossValue:"90",debt:"0"},
      {...base("vb"),kind:"valuation",investmentKey:"b",asOfDate:"2026-01-01",grossValue:"4",debt:"9"},
      {...base("vc"),kind:"valuation",investmentKey:"c",asOfDate:"2026-01-01",grossValue:"0",debt:"0"},
    ]},
  };
}
