import type { Employee, Expense } from "./types";

const esc = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/**
 * Builds a Tally import file: one Journal voucher per expense, debiting the
 * expense ledger (the category) and crediting the employee's ledger, so the
 * amount shows up as owed to that employee.
 */
export function buildTallyXml(expenses: Expense[], employees: Employee[]): string {
  const company = process.env.TALLY_COMPANY || "";
  const nameOf = new Map(employees.map((e) => [e.id, e.name]));

  const vouchers = expenses
    .map((e) => {
      const who = nameOf.get(e.employeeId) || "Employee";
      const amount = e.amount.toFixed(2);
      const narration = [e.merchant, e.description, e.note]
        .filter(Boolean)
        .join(" | ");
      return `
    <TALLYMESSAGE xmlns:UDF="TallyUDF">
      <VOUCHER VCHTYPE="Journal" ACTION="Create">
        <DATE>${e.date.replace(/-/g, "")}</DATE>
        <VOUCHERTYPENAME>Journal</VOUCHERTYPENAME>
        <REFERENCE>${esc(e.id)}</REFERENCE>
        <NARRATION>${esc(narration)}</NARRATION>
        <ALLLEDGERENTRIES.LIST>
          <LEDGERNAME>${esc(e.category)}</LEDGERNAME>
          <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
          <AMOUNT>-${amount}</AMOUNT>
        </ALLLEDGERENTRIES.LIST>
        <ALLLEDGERENTRIES.LIST>
          <LEDGERNAME>${esc(who)}</LEDGERNAME>
          <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
          <AMOUNT>${amount}</AMOUNT>
        </ALLLEDGERENTRIES.LIST>
      </VOUCHER>
    </TALLYMESSAGE>`;
    })
    .join("");

  return `<?xml version="1.0" encoding="UTF-8"?>
<ENVELOPE>
  <HEADER>
    <TALLYREQUEST>Import Data</TALLYREQUEST>
  </HEADER>
  <BODY>
    <IMPORTDATA>
      <REQUESTDESC>
        <REPORTNAME>Vouchers</REPORTNAME>
        <STATICVARIABLES>
          <SVCURRENTCOMPANY>${esc(company)}</SVCURRENTCOMPANY>
        </STATICVARIABLES>
      </REQUESTDESC>
      <REQUESTDATA>${vouchers}
      </REQUESTDATA>
    </IMPORTDATA>
  </BODY>
</ENVELOPE>
`;
}
