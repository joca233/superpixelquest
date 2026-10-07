import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";

export const Route = createFileRoute("/loja")({
  head: () => ({
    meta: [
      { title: "Loja Pixel Quest — Produtos Retrô Oficiais" },
      { name: "description", content: "Camisetas, canecas, pelúcias e acessórios retrô do Pixel Quest com entrega para todo o Brasil." },
      { property: "og:title", content: "Loja Pixel Quest — Produtos Retrô Oficiais" },
      { property: "og:description", content: "Produtos oficiais em pixel art com frete grátis acima de R$ 199." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Loja,
});

type Produto = { id: number; nome: string; preco: number; cat: string; icone: string; selo?: string };

const PRODUTOS: Produto[] = [
  { id: 1, nome: "Camiseta Herói Pixel", preco: 79.9, cat: "Roupas", icone: "👕", selo: "Mais vendido" },
  { id: 2, nome: "Caneca Bloco ?", preco: 49.9, cat: "Casa", icone: "☕" },
  { id: 3, nome: "Pelúcia Cogumelo", preco: 89.9, cat: "Brinquedos", icone: "🍄", selo: "Novo" },
  { id: 4, nome: "Moletom Cano Verde", preco: 169.9, cat: "Roupas", icone: "🧥" },
  { id: 5, nome: "Controle Retrô USB", preco: 129.9, cat: "Acessórios", icone: "🎮", selo: "-20%" },
  { id: 6, nome: "Luminária Moeda", preco: 99.9, cat: "Casa", icone: "🪙" },
  { id: 7, nome: "Boné Botas de Velocidade", preco: 59.9, cat: "Roupas", icone: "🧢" },
  { id: 8, nome: "Pôster Green Hill", preco: 39.9, cat: "Casa", icone: "🖼️" },
];
const CATS = ["Todos", "Roupas", "Casa", "Brinquedos", "Acessórios"];
const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function Loja() {
  const [cat, setCat] = useState("Todos");
  const [carrinho, setCarrinho] = useState<Record<number, number>>({});
  const [aberto, setAberto] = useState(false);
  const [finalizado, setFinalizado] = useState(false);

  const lista = cat === "Todos" ? PRODUTOS : PRODUTOS.filter((p) => p.cat === cat);
  const itens = Object.entries(carrinho).map(([id, q]) => ({ p: PRODUTOS.find((x) => x.id === +id)!, q }));
  const qtd = itens.reduce((s, i) => s + i.q, 0);
  const total = itens.reduce((s, i) => s + i.q * i.p.preco, 0);
  const add = (id: number, d = 1) =>
    setCarrinho((c) => {
      const n = { ...c, [id]: (c[id] ?? 0) + d };
      if (n[id]! <= 0) delete n[id];
      return n;
    });

  return (
    <div className="min-h-screen bg-background font-sans text-foreground">
      <header className="sticky top-0 z-30 border-b border-border bg-background/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <Link to="/" className="font-display text-xs text-accent sm:text-sm">PIXEL QUEST · LOJA</Link>
          <nav className="flex items-center gap-4 text-sm">
            <Link to="/" className="text-muted-foreground hover:text-foreground">Jogar</Link>
            <button onClick={() => setAberto(true)} className="rounded bg-primary px-4 py-2 font-semibold text-primary-foreground">
              Carrinho ({qtd})
            </button>
          </nav>
        </div>
      </header>

      <section className="mx-auto grid max-w-6xl gap-8 px-4 py-16 md:grid-cols-2 md:items-center">
        <div>
          <p className="mb-3 text-sm font-semibold uppercase tracking-widest text-accent">Coleção oficial 2026</p>
          <h1 className="font-display text-2xl leading-relaxed sm:text-4xl">Leve a aventura para fora da tela</h1>
          <p className="mt-6 text-lg text-muted-foreground">Produtos em pixel art feitos com qualidade premium. Frete grátis acima de R$ 199 e troca em até 30 dias.</p>
          <a href="#produtos" className="mt-8 inline-block rounded bg-accent px-6 py-3 font-bold text-accent-foreground">Ver produtos</a>
        </div>
        <div className="grid grid-cols-3 gap-3 text-5xl">
          {["🍄", "🪙", "⭐", "🎮", "👕", "🧢"].map((e) => (
            <div key={e} className="flex aspect-square items-center justify-center rounded-lg border border-border bg-card">{e}</div>
          ))}
        </div>
      </section>

      <section className="border-y border-border bg-card">
        <div className="mx-auto grid max-w-6xl gap-4 px-4 py-6 text-center text-sm sm:grid-cols-3">
          <p>🚚 Frete grátis acima de R$ 199</p>
          <p>🔒 Pagamento 100% seguro</p>
          <p>↩️ Troca grátis em 30 dias</p>
        </div>
      </section>

      <main id="produtos" className="mx-auto max-w-6xl px-4 py-16">
        <h2 className="font-display text-lg">Produtos</h2>
        <div className="mt-6 flex flex-wrap gap-2">
          {CATS.map((c) => (
            <button key={c} onClick={() => setCat(c)}
              className={`rounded border px-4 py-2 text-sm ${cat === c ? "border-accent bg-accent text-accent-foreground" : "border-border hover:bg-secondary"}`}>
              {c}
            </button>
          ))}
        </div>
        <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {lista.map((p) => (
            <article key={p.id} className="flex flex-col rounded-lg border border-border bg-card p-4 transition hover:-translate-y-1">
              <div className="relative flex aspect-square items-center justify-center rounded bg-secondary text-6xl">
                {p.icone}
                {p.selo && <span className="absolute left-2 top-2 rounded bg-primary px-2 py-1 text-xs font-bold text-primary-foreground">{p.selo}</span>}
              </div>
              <p className="mt-4 text-xs uppercase text-muted-foreground">{p.cat}</p>
              <h3 className="font-semibold">{p.nome}</h3>
              <p className="mt-1 text-xl font-bold text-accent">{brl(p.preco)}</p>
              <p className="text-xs text-muted-foreground">ou 3x de {brl(p.preco / 3)} sem juros</p>
              <button onClick={() => add(p.id)} className="mt-4 rounded bg-primary py-2 font-semibold text-primary-foreground">Adicionar ao carrinho</button>
            </article>
          ))}
        </div>
      </main>

      <footer className="border-t border-border py-8 text-center text-sm text-muted-foreground">© 2026 Pixel Quest Loja · contato@pixelquest.com.br</footer>

      {aberto && (
        <div className="fixed inset-0 z-40 flex justify-end bg-background/70" onClick={() => setAberto(false)}>
          <aside className="flex h-full w-full max-w-md flex-col bg-card p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="font-display text-sm">Carrinho</h2>
              <button onClick={() => setAberto(false)} className="text-2xl">×</button>
            </div>
            {finalizado ? (
              <p className="mt-10 text-center text-lg">✅ Pedido recebido! Obrigado pela compra.</p>
            ) : itens.length === 0 ? (
              <p className="mt-10 text-center text-muted-foreground">Seu carrinho está vazio.</p>
            ) : (
              <>
                <ul className="mt-6 flex-1 space-y-4 overflow-auto">
                  {itens.map(({ p, q }) => (
                    <li key={p.id} className="flex items-center gap-3">
                      <span className="text-3xl">{p.icone}</span>
                      <div className="flex-1">
                        <p className="text-sm font-semibold">{p.nome}</p>
                        <p className="text-sm text-accent">{brl(p.preco * q)}</p>
                      </div>
                      <button onClick={() => add(p.id, -1)} className="h-8 w-8 rounded border border-border">−</button>
                      <span>{q}</span>
                      <button onClick={() => add(p.id)} className="h-8 w-8 rounded border border-border">+</button>
                    </li>
                  ))}
                </ul>
                <div className="border-t border-border pt-4">
                  <p className="flex justify-between text-sm"><span>Frete</span><span>{total >= 199 ? "Grátis" : brl(19.9)}</span></p>
                  <p className="mt-2 flex justify-between text-lg font-bold"><span>Total</span><span>{brl(total + (total >= 199 ? 0 : 19.9))}</span></p>
                  <button onClick={() => { setFinalizado(true); setCarrinho({}); }} className="mt-4 w-full rounded bg-accent py-3 font-bold text-accent-foreground">Finalizar compra</button>
                </div>
              </>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}
