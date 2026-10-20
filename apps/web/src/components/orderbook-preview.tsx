import { readOrderBook } from "@/lib/chain";
import { atoms } from "./ui";
import { BRAND } from "@/lib/brand";

export async function OrderBookPreview() {
  const book = await readOrderBook().catch(() => ({ asks: [], fills: [], slot: 0 }));
  const levels = Array.from({ length: 11 }, (_, i) => 1.0 - i * 0.05);
  const byPrice = new Map<string, number>();
  for (const a of book.asks) { const p = (a.price / 1e6).toFixed(2); byPrice.set(p, (byPrice.get(p) || 0) + a.remaining); }
  return (
    <div className="card p-5">
      <div className="flex justify-between text-sm"><span className="font-medium">Order book</span><span className="text-fg-3 num">{book.slot ? `Read at slot ${book.slot.toLocaleString()}` : "Not connected"}</span></div>
      <table className="w-full text-sm mt-4">
        <thead><tr className="label"><th className="text-left font-normal pb-2">Price</th><th className="text-right font-normal pb-2">Available</th><th className="w-8" /></tr></thead>
        <tbody className="num">
          {levels.map(p => { const k = p.toFixed(2); const v = byPrice.get(k); return (
            <tr key={k} className="border-t border-line"><td className="py-1.5">${k}</td><td className="py-1.5 text-right text-fg-2">{v ? atoms(v) : ""}</td><td className="text-right text-fg-3">{v ? "" : "–"}</td></tr>); })}
        </tbody>
      </table>
      {!book.asks.length && <p className="text-fg-3 text-sm mt-3">No asks yet</p>}
      <p className="font-medium text-sm mt-6">Recent fills</p>
      {book.fills.length ? <ul className="text-sm num mt-2 space-y-1">{book.fills.slice(0, 5).map((f, i) => <li key={i} className="flex justify-between text-fg-2"><span>${(f.price / 1e6).toFixed(2)}</span><span>{atoms(f.amount)} {BRAND.creditToken}</span></li>)}</ul> : <p className="text-fg-3 text-sm mt-1">No fills yet</p>}
      <p className="text-xs text-fg-3 mt-4 italic">Book prices and amounts exclude the buyer fee.</p>
    </div>
  );
}
