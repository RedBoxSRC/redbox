import { useEffect, useMemo, useState } from "react";
import { Block, Transaction } from "@redbox/core";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:26657";
const WS_URL = (API_BASE as string).replace(/^http/, "ws") + "/ws";

type Status = {
  chainId: string;
  height: number;
  mempool: number;
  consensus: string;
  validators: string[];
};

export default function App() {
  const [status, setStatus] = useState<Status | null>(null);
  const [state, setState] = useState<any>(null);
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [selectedBlock, setSelectedBlock] = useState<Block | null>(null);
  const [txType, setTxType] = useState("message");
  const [payloadText, setPayloadText] = useState("{\"message\":\"hello\"}");
  const [senderPubKey, setSenderPubKey] = useState("");
  const [signature, setSignature] = useState("");
  const [txFeedback, setTxFeedback] = useState<string | null>(null);

  const fetchStatus = async () => {
    const res = await fetch(`${API_BASE}/status`);
    if (res.ok) setStatus(await res.json());
  };

  const fetchState = async () => {
    const res = await fetch(`${API_BASE}/state`);
    if (res.ok) setState(await res.json());
  };

  const fetchBlocks = async (count = 5) => {
    const latestRes = await fetch(`${API_BASE}/block/latest`);
    if (!latestRes.ok) return;
    const latest = (await latestRes.json()) as Block;
    const list: Block[] = [];
    for (let h = latest.height; h > 0 && list.length < count; h--) {
      const res = await fetch(`${API_BASE}/block/${h}`);
      if (res.ok) {
        const b = await res.json();
        list.push(b);
      }
    }
    setBlocks(list);
    setSelectedBlock(list[0] ?? latest);
  };

  const submitTx = async () => {
    try {
      const payload = payloadText ? JSON.parse(payloadText) : {};
      const tx: Partial<Transaction> = {
        type: txType,
        payload,
        senderPubKey: senderPubKey || undefined,
        signature: signature || undefined
      };
      const res = await fetch(`${API_BASE}/tx`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(tx)
      });
      const body = await res.json();
      setTxFeedback(body.ok ? `Accepted: ${body.id}` : `Error: ${body.error}`);
    } catch (err) {
      setTxFeedback((err as Error).message);
    }
  };

  useEffect(() => {
    fetchStatus();
    fetchState();
    fetchBlocks();
    const ws = new WebSocket(WS_URL);
    ws.onmessage = (msg) => {
      try {
        const data = JSON.parse(msg.data as string);
        if (data.type === "status") setStatus(data.data);
        if (data.type === "newBlock") {
          setBlocks((prev) => [data.data.block, ...prev].slice(0, 5));
          setSelectedBlock(data.data.block);
          fetchState();
        }
      } catch {
        // ignore parse errors
      }
    };
    return () => ws.close();
  }, []);

  const statePreview = useMemo(() => JSON.stringify(state, null, 2), [state]);

  return (
    <div className="page">
      <header>
        <div>
          <h1>Redbox Explorer</h1>
          <p>Chain introspection for your mini blockchain</p>
        </div>
        {status && (
          <div className="status-card">
            <div>Chain: {status.chainId}</div>
            <div>Height: {status.height}</div>
            <div>Mempool: {status.mempool}</div>
            <div>Consensus: {status.consensus}</div>
          </div>
        )}
      </header>

      <section className="grid">
        <div className="panel">
          <h2>Blocks</h2>
          <ul className="block-list">
            {blocks.map((b) => (
              <li
                key={b.blockHash}
                className={selectedBlock?.blockHash === b.blockHash ? "active" : ""}
                onClick={() => setSelectedBlock(b)}
              >
                <div>Height {b.height}</div>
                <div>{new Date(b.timestamp).toLocaleTimeString()}</div>
                <div>{b.txs.length} tx</div>
              </li>
            ))}
          </ul>
        </div>

        <div className="panel">
          <h2>Block Detail</h2>
          {selectedBlock ? (
            <pre className="code">{JSON.stringify(selectedBlock, null, 2)}</pre>
          ) : (
            <p>No block selected</p>
          )}
        </div>
      </section>

      <section className="grid">
        <div className="panel">
          <h2>State</h2>
          <pre className="code">{statePreview}</pre>
        </div>

        <div className="panel">
          <h2>Submit Tx</h2>
          <div className="form">
            <label>
              Type
              <input value={txType} onChange={(e) => setTxType(e.target.value)} />
            </label>
            <label>
              Payload (JSON)
              <textarea value={payloadText} onChange={(e) => setPayloadText(e.target.value)} />
            </label>
            <label>
              Sender PubKey (optional)
              <input value={senderPubKey} onChange={(e) => setSenderPubKey(e.target.value)} />
            </label>
            <label>
              Signature (optional)
              <input value={signature} onChange={(e) => setSignature(e.target.value)} />
            </label>
            <button onClick={submitTx}>Send</button>
            {txFeedback && <div className="feedback">{txFeedback}</div>}
          </div>
        </div>
      </section>
    </div>
  );
}
