import "server-only";
import { eq } from "drizzle-orm";
import { createPortfolioService } from "@/application/portfolio";
import type { createDatabase } from "./database";
import { createPostgresPortfolioRepository } from "./records";
import {
  accountTypes, assetClasses, customGroups, households, institutions,
  investmentGroups, investments, liquidities, owners, taxStatuses,
} from "./schema";

type Database = ReturnType<typeof createDatabase>["db"];
const demoHouseholdId = "00000000-0000-4000-8000-000000000013";

/** This fixture is invented for development; no values come from a real portfolio. */
export async function seedDemoPortfolio(db: Database): Promise<"created" | "already-seeded"> {
  return db.transaction(async (tx) => {
    const existing = await tx.select({ id: households.id }).from(households);
    if (existing.length > 0) {
      if (existing.length === 1 && existing[0].id === demoHouseholdId) return "already-seeded";
      throw new Error("Demo seed requires an empty household database.");
    }

    await tx.insert(households).values({ id: demoHouseholdId, name: "Example Household" });
    const [alex, blair] = await tx.insert(owners).values([
      { householdId: demoHouseholdId, name: "Owner A" },
      { householdId: demoHouseholdId, name: "Owner B" },
    ]).returning();
    const [market, property, insurance, digital] = await tx.insert(assetClasses).values(
      ["Public markets", "Property", "Insurance", "Digital assets"].map((label) => ({ householdId: demoHouseholdId, label })),
    ).returning();
    const [brokerage, retirement, privateAccount, policy, wallet] = await tx.insert(accountTypes).values(
      ["Brokerage", "Retirement", "Private investment", "Policy", "Wallet"].map((label) => ({ householdId: demoHouseholdId, label })),
    ).returning();
    const [taxable, deferred] = await tx.insert(taxStatuses).values(
      ["Taxable", "Tax deferred"].map((label) => ({ householdId: demoHouseholdId, label })),
    ).returning();
    const [liquid, limited] = await tx.insert(liquidities).values(
      ["Liquid", "Limited liquidity"].map((label) => ({ householdId: demoHouseholdId, label })),
    ).returning();
    const [exampleProvider] = await tx.insert(institutions).values({
      householdId: demoHouseholdId, label: "Example Provider",
    }).returning();
    const [longTerm] = await tx.insert(customGroups).values({
      householdId: demoHouseholdId, label: "Long term examples",
    }).returning();

    // A Drizzle transaction supports the same queries and nested transaction method
    // used by the repository; the outer transaction makes the entire seed atomic.
    const service = createPortfolioService(createPostgresPortfolioRepository(tx));
    const shared = { householdId: demoHouseholdId };
    const brokerageInvestment = await service.createInvestment({ ...shared, name: "Sample Market Account",
      ownerIds: [alex.id], assetClassId: market.id, accountTypeId: brokerage.id,
      taxStatusId: taxable.id, liquidityId: liquid.id, institutionId: exampleProvider.id });
    const retirementInvestment = await service.createInvestment({ ...shared, name: "Sample Retirement Account",
      ownerIds: [blair.id], assetClassId: market.id, accountTypeId: retirement.id,
      taxStatusId: deferred.id, liquidityId: liquid.id });
    const propertyInvestment = await service.createInvestment({ ...shared, name: "Sample Property Investment",
      ownerIds: [alex.id, blair.id], assetClassId: property.id, accountTypeId: privateAccount.id,
      taxStatusId: taxable.id, liquidityId: limited.id });
    const policyInvestment = await service.createInvestment({ ...shared, name: "Sample Insurance Policy",
      ownerIds: [alex.id], assetClassId: insurance.id, accountTypeId: policy.id,
      taxStatusId: deferred.id, liquidityId: limited.id });
    const cryptoInvestment = await service.createInvestment({ ...shared, name: "Sample Digital Asset Wallet",
      ownerIds: [blair.id], assetClassId: digital.id, accountTypeId: wallet.id,
      taxStatusId: taxable.id, liquidityId: liquid.id });
    await tx.insert(investmentGroups).values([
      { ...shared, investmentId: retirementInvestment.id, groupId: longTerm.id },
      { ...shared, investmentId: propertyInvestment.id, groupId: longTerm.id },
      { ...shared, investmentId: policyInvestment.id, groupId: longTerm.id },
    ]);

    const contribution = (investmentId: string, effectiveDate: string, amount: string) =>
      service.recordExternalAction({ ...shared, investmentId, kind: "contribution", effectiveDate, amount, source: "system" });
    const withdrawal = (investmentId: string, effectiveDate: string, amount: string) =>
      service.recordExternalAction({ ...shared, investmentId, kind: "withdrawal", effectiveDate, amount, source: "system" });
    const mark = (investmentId: string, asOfDate: string, grossValue: string, debt = "0.00") =>
      service.recordValuationMark({ ...shared, investmentId, asOfDate, grossValue, debt, source: "system" });

    await contribution(brokerageInvestment.id, "2025-01-06", "10000.00");
    await contribution(retirementInvestment.id, "2025-01-06", "8000.00");
    await contribution(propertyInvestment.id, "2025-02-03", "12000.00");
    await contribution(policyInvestment.id, "2025-02-03", "2500.00");
    await contribution(cryptoInvestment.id, "2025-03-03", "900.00");
    await mark(brokerageInvestment.id, "2025-03-31", "10250.00");
    await mark(retirementInvestment.id, "2025-03-31", "8200.00");
    await mark(propertyInvestment.id, "2025-03-31", "18000.00", "21000.00");
    await mark(policyInvestment.id, "2025-03-31", "2550.00");
    await mark(cryptoInvestment.id, "2025-03-31", "700.00");

    await service.recordTransfer({ ...shared, sourceInvestmentId: brokerageInvestment.id,
      destinationInvestmentId: retirementInvestment.id, effectiveDate: "2025-04-02",
      amount: "750.00", source: "system" });
    await withdrawal(brokerageInvestment.id, "2025-05-05", "400.00");
    await withdrawal(cryptoInvestment.id, "2025-05-05", "200.00");
    await mark(brokerageInvestment.id, "2025-06-30", "9400.00");
    await mark(retirementInvestment.id, "2025-06-30", "9150.00");
    await mark(propertyInvestment.id, "2025-06-30", "19500.00", "20500.00");
    await mark(policyInvestment.id, "2025-06-30", "2700.00");
    await mark(cryptoInvestment.id, "2025-06-30", "0.00");
    await service.closeInvestment(demoHouseholdId, cryptoInvestment.id, "2025-06-30");

    // Assert closure retained the historical rows before committing the fixture.
    const [closed] = await tx.select({ status: investments.status }).from(investments)
      .where(eq(investments.id, cryptoInvestment.id));
    if (closed?.status !== "closed") throw new Error("Demo investment did not close.");
    return "created";
  });
}
