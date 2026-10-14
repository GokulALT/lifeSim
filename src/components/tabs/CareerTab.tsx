import type { CharacterClient } from "@/lib/schemas/character";

export function CareerTab({ character }: { character: CharacterClient }) {
  const { career, financials } = character;
  return (
    <div className="p-4 text-sm text-gray-300 space-y-3">
      <div className="flex justify-between"><span className="text-gray-500">Job</span><span>{career.currentJob ?? "Unemployed"}</span></div>
      <div className="flex justify-between"><span className="text-gray-500">Employer</span><span>{career.employer ?? "—"}</span></div>
      <div className="flex justify-between"><span className="text-gray-500">Education</span><span>{career.education}</span></div>
      <div className="flex justify-between"><span className="text-gray-500">Performance</span><span>{career.performance}/100</span></div>
      <div className="flex justify-between"><span className="text-gray-500">Salary</span><span>${financials.salary.toLocaleString()}/yr</span></div>
      <div className="flex justify-between"><span className="text-gray-500">Years in role</span><span>{career.yearsInRole}</span></div>
    </div>
  );
}
