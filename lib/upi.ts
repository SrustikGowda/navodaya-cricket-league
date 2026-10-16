export function upiDeepLink(input: { vpa: string; payee: string; paise: number; note: string }): string {
  const params = new URLSearchParams({
    pa: input.vpa,
    pn: input.payee,
    am: (input.paise / 100).toFixed(2),
    cu: "INR",
    tn: input.note,
  });
  return `upi://pay?${params.toString()}`;
}
