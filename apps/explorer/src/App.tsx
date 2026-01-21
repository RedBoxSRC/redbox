import { useEffect, useMemo, useState } from "react";
import { Block, Transaction } from "@redbox/core";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:26657";
const WS_URL = (API_BASE as string).replace(/^http/, "ws") + "/ws";
const BLOCK_WINDOW = 12;

type Status = {
  chainId: string;
  height: number;
  mempool: number;
  consensus: string;
  validators: string[];
};

type Snapshot = { height: number; state: any };
type LiveTx = Transaction & { status: "queued" | "included"; blockHeight?: number; seenAt: number };

export default function App() {
  const [status, setStatus] = useState<Status | null>(null);
  const [state, setState] = useState<any>(null);
  const [stateAtHeight, setStateAtHeight] = useState<Snapshot | null>(null);
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [selectedBlock, setSelectedBlock] = useState<Block | null>(null);
  const [liveTxs, setLiveTxs] = useState<LiveTx[]>([]);
  const [txType, setTxType] = useState("message");
  const [payloadText, setPayloadText] = useState('{"message":"hello"}');
  const [senderPubKey, setSenderPubKey] = useState("");
  const [signature, setSignature] = useState("");
  const [txFeedback, setTxFeedback] = useState<string | null>(null);
  const [blocksLoading, setBlocksLoading] = useState(false);
  const [snapshotLoading, setSnapshotLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);

  const fetchStatus = async () => {
    const res = await fetch(`${API_BASE}/status`);
    if (res.ok) {
      const data = (await res.json()) as Status;
      setStatus(data);
      setLastUpdated(Date.now());
      return data;
    }
    return null;
  };

  const fetchState = async () => {
    const res = await fetch(`${API_BASE}/state`);
    if (res.ok) setState(await res.json());
  };

  const fetchBlocks = async (windowSize = BLOCK_WINDOW, toHeight?: number) => {
    setBlocksLoading(true);
    try {
      let targetHeight = toHeight;
      if (targetHeight === undefined) {
        const st = status ?? (await fetchStatus());
        targetHeight = st?.height;
      }
      if (targetHeight === undefined) {
        const latestRes = await fetch(`${API_BASE}/block/latest`);
        if (latestRes.ok) {
          const latest = (await latestRes.json()) as Block;
          targetHeight = latest.height;
        }
      }
      if (targetHeight === undefined) return;
      const from = Math.max(0, targetHeight - (windowSize - 1));
      const res = await fetch(`${API_BASE}/export/blocks?from=${from}&to=${targetHeight}`);
      if (!res.ok) return;
      const body = await res.json();
      const fetched = ((body.blocks ?? []) as Block[]).sort((a, b) => b.height - a.height);
      setBlocks(fetched);
      if (fetched.length && (!selectedBlock || !fetched.find((b) => b.blockHash === selectedBlock.blockHash))) {
        setSelectedBlock(fetched[0]);
      }
    } finally {
      setBlocksLoading(false);
    }
  };

  const pushTx = (tx: Transaction, txStatus: LiveTx["status"], blockHeight?: number) => {
    setLiveTxs((prev) => {
      const existing = prev.find((t) => t.id === tx.id);
      const seenAt = existing?.seenAt ?? Date.now();
      const updated: LiveTx = { ...existing, ...tx, status: txStatus, blockHeight, seenAt };
      const next = [updated, ...prev.filter((t) => t.id !== tx.id)];
      return next.slice(0, 40);
    });
  };

  const fetchSnapshot = async (height: number) => {
    setSnapshotLoading(true);
    try {
      const res = await fetch(`${API_BASE}/state/${height}`);
      if (!res.ok) {
        setStateAtHeight(null);
        return;
      }
      const snapshot = (await res.json()) as Snapshot;
      setStateAtHeight(snapshot);
    } finally {
      setSnapshotLoading(false);
    }
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
      if (body.ok && body.id) {
        pushTx({ ...(tx as Transaction), id: body.id }, "queued");
      }
      setTxFeedback(body.ok ? `Accepted: ${body.id}` : `Error: ${body.error}`);
    } catch (err) {
      setTxFeedback((err as Error).message);
    }
  };

  const loadOlderBlocks = () => {
    const oldest = blocks[blocks.length - 1];
    if (!oldest || oldest.height === 0) return;
    fetchBlocks(BLOCK_WINDOW, oldest.height - 1);
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
        if (data.type === "newTx") {
          pushTx(data.data as Transaction, "queued");
        }
        if (data.type === "newBlock") {
          const block = (data.data.block ?? data.data) as Block;
          setBlocks((prev) => {
            const merged = [block, ...prev.filter((b) => b.blockHash !== block.blockHash)];
            return merged.slice(0, BLOCK_WINDOW);
          });
          setSelectedBlock(block);
          setState(data.data.state ?? null);
          if (block?.txs?.length) {
            block.txs.forEach((tx: Transaction) => pushTx(tx, "included", block.height));
          }
          setStateAtHeight(null);
          fetchStatus();
        }
      } catch {
        // ignore parse errors
      }
    };
    const statusInterval = setInterval(fetchStatus, 8000);
    return () => {
      ws.close();
      clearInterval(statusInterval);
    };
  }, []);

  const statePreview = useMemo(() => JSON.stringify(state, null, 2), [state]);
  const snapshotPreview = useMemo(
    () => (stateAtHeight ? JSON.stringify(stateAtHeight.state, null, 2) : "Pick a block to load a snapshot."),
    [stateAtHeight]
  );

  return (
    <div className="page">
      <header className="hero">
        <div className="hero-copy">
          <p className="eyebrow">Redbox v0.8.7 · Local control room</p>
          <h1>Observe, test, and ship your chain faster.</h1>
          <p>
            Live chain health, block history, mempool activity, and state snapshots in one place.
            The explorer auto-connects to the node at {API_BASE}.
          </p>
          <div className="hero-actions">
            <button className="primary" onClick={() => fetchBlocks()}>
              Sync latest blocks
            </button>
            <button className="ghost" onClick={() => fetchState()}>
              Refresh state
            </button>
            <span className="timestamp">
              Updated {lastUpdated ? new Date(lastUpdated).toLocaleTimeString() : "waiting..."}
            </span>
          </div>
        </div>
        <div className="hero-card">
          <div className="hero-row">
            <span>Chain</span>
            <strong>{status?.chainId ?? "connecting..."}</strong>
          </div>
          <div className="hero-row">
            <span>Height</span>
            <strong>{status?.height ?? 0}</strong>
          </div>
          <div className="hero-row">
            <span>Mempool</span>
            <strong>{status?.mempool ?? 0} tx</strong>
          </div>
          <div className="hero-row">
            <span>Consensus</span>
            <strong className="pill">{status?.consensus ?? "..."}</strong>
          </div>
        </div>
      </header>

      <section className="metrics">
        <div className="metric-card">
          <p className="metric-label">Validators</p>
          <p className="metric-value">{status?.validators.length ?? 0}</p>
          <p className="metric-sub">Active peers allowed to propose blocks.</p>
        </div>
        <div className="metric-card">
          <p className="metric-label">Latest block</p>
          <p className="metric-value">{blocks[0]?.height ?? status?.height ?? 0}</p>
          <p className="metric-sub">{blocks[0]?.txs.length ?? 0} transactions</p>
        </div>
        <div className="metric-card">
          <p className="metric-label">Mempool</p>
          <p className="metric-value accent">{status?.mempool ?? 0}</p>
          <p className="metric-sub">Queued transactions waiting to be proposed.</p>
        </div>
        <div className="metric-card">
          <p className="metric-label">API</p>
          <p className="metric-value">{API_BASE}</p>
          <p className="metric-sub">Explorer stays attached to this endpoint.</p>
        </div>
      </section>

      <section className="grid">
        <div className="panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Blocks</p>
              <h2>Recent timeline</h2>
            </div>
            <div className="panel-actions">
              <button onClick={() => fetchBlocks()} disabled={blocksLoading}>
                {blocksLoading ? "Syncing..." : "Reload"}
              </button>
              <button onClick={loadOlderBlocks} disabled={!blocks.length || blocks[blocks.length - 1].height === 0}>
                Load older
              </button>
            </div>
          </div>
          <div className="block-list">
            {blocks.map((b) => (
              <article
                key={b.blockHash}
                className={`block-row ${selectedBlock?.blockHash === b.blockHash ? "active" : ""}`}
                onClick={() => setSelectedBlock(b)}
              >
                <div className="block-top">
                  <div className="pill">Height {b.height}</div>
                  <span>{new Date(b.timestamp).toLocaleTimeString()}</span>
                </div>
                <div className="block-meta">
                  <span>{b.txs.length} tx</span>
                  <span>Proposer {b.proposerPubKey.slice(0, 10)}...</span>
                  <span>Hash {b.blockHash.slice(0, 8)}...</span>
                </div>
              </article>
            ))}
            {!blocks.length && <p className="muted">Waiting for blocks...</p>}
          </div>
        </div>

        <div className="panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Block detail</p>
              <h2>{selectedBlock ? `Height ${selectedBlock.height}` : "Pick a block"}</h2>
            </div>
            <div className="panel-actions">
              <button onClick={() => selectedBlock && fetchSnapshot(selectedBlock.height)} disabled={!selectedBlock}>
                {snapshotLoading ? "Loading..." : "Load state @ height"}
              </button>
            </div>
          </div>
          {selectedBlock ? (
            <>
              <div className="pill-row">
                <span className="pill">Tx {selectedBlock.txs.length}</span>
                <span className="pill">Proposer {selectedBlock.proposerPubKey.slice(0, 12)}...</span>
                <span className="pill">Prev {selectedBlock.prevHash ? `${selectedBlock.prevHash.slice(0, 10)}...` : "genesis"}</span>
              </div>
              <pre className="code">{JSON.stringify(selectedBlock, null, 2)}</pre>
            </>
          ) : (
            <p className="muted">Select a block to inspect its payloads.</p>
          )}
        </div>
      </section>

      <section className="grid">
        <div className="panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Live transactions</p>
              <h2>Stream & mempool</h2>
            </div>
            <div className="panel-actions">
              <span className="pill subtle">{status?.mempool ?? 0} queued</span>
            </div>
          </div>
          <div className="tx-feed">
            {liveTxs.map((tx) => (
              <div key={tx.id} className={`tx-row ${tx.status}`}>
                <div>
                  <p className="tx-id">{tx.id}</p>
                  <p className="tx-meta">
                    {tx.type} · seen {new Date(tx.seenAt).toLocaleTimeString()}
                  </p>
                </div>
                <div className="tx-tags">
                  <span className="pill">{tx.status}</span>
                  {tx.blockHeight !== undefined && <span className="pill subtle">Block {tx.blockHeight}</span>}
                </div>
              </div>
            ))}
            {!liveTxs.length && <p className="muted">Transactions will appear here as they hit the mempool.</p>}
          </div>
        </div>

        <div className="panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">State</p>
              <h2>Live & snapshots</h2>
            </div>
            <div className="panel-actions">
              <button onClick={() => fetchState()}>Refresh</button>
            </div>
          </div>
          <div className="state-grid">
            <div>
              <h3>Latest</h3>
              <pre className="code">{statePreview}</pre>
            </div>
            <div>
              <div className="snapshot-header">
                <h3>Snapshot</h3>
                {stateAtHeight && <span className="pill subtle">@ block {stateAtHeight.height}</span>}
              </div>
              <pre className="code">{snapshotPreview}</pre>
            </div>
          </div>
        </div>
      </section>

      <section className="panel form-panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Submit transaction</p>
            <h2>Playground</h2>
          </div>
          <div className="panel-actions">
            <button
              className="ghost"
              onClick={() => {
                setTxType("message");
                setPayloadText('{"message":"hello"}');
              }}
            >
              Quick preset
            </button>
          </div>
        </div>
        <div className="form-grid">
          <label>
            Type
            <input value={txType} onChange={(e) => setTxType(e.target.value)} />
          </label>
          <label className="full">
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
          <div className="form-actions">
            <button className="primary" onClick={submitTx}>
              Send
            </button>
            {txFeedback && <div className="feedback">{txFeedback}</div>}
          </div>
        </div>
      </section>
    </div>
  );
}
