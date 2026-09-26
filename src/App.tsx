import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { HistoryScreen } from './components/HistoryScreen';
import { musclesOfDay } from './components/PlanEditor';
import { PlansScreen } from './components/PlansScreen';
import { Icon, TabBar, type Tab } from './components/ui';
import { WorkoutSummaryScreen } from './components/WorkoutSummary';
import { WorkoutScreen } from './components/WorkoutScreen';
import {
  archivePlan,
  fetchExercises,
  fetchHistory,
  fetchLastPlanDayId,
  fetchLastSets,
  fetchPlans,
  flushOutbox,
  getSessionEmail,
  savePlanRows,
  sendLoginLink,
  signIn,
  signOut,
  syncPayload,
  verifyLoginCode,
} from './lib/api';
import {
  draftFromPlanDay,
  markSaved,
  planToRows,
  templateDay,
  visibleDays,
  visibleExercises,
  type Plan,
} from './lib/plan';
import { normalizeCode } from './lib/authErrors';
import { nextPlanDay } from './lib/rotation';
import {
  draftToHist,
  mergeHistory,
  summarizeWorkout,
  type ExerciseMeta,
  type HistWorkout,
  type WorkoutSummary,
} from './lib/stats';
import { browserStore, type ExerciseListItem, type LastInfo } from './lib/storage';
import {
  buildPayload,
  createDraft,
  doneSetsAsLogged,
  type Draft,
  type DraftExercise,
} from './lib/workout';
import { configError, supabase } from './supabase';


function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([p, new Promise<null>((resolve) => setTimeout(() => resolve(null), ms))]);
}

export function App() {
  const store = useMemo(() => browserStore(), []);

  const [email, setEmail] = useState<string | null | undefined>(undefined); // undefined = lädt
  const [draft, setDraft] = useState<Draft | null>(() => store.loadDraft());
  const [exercises, setExercises] = useState<ExerciseListItem[]>(() => store.loadExercises());
  const [plans, setPlans] = useState<Plan[]>(() => store.loadPlans());
  // Erst nach dem ersten Laden (oder mit Zwischenspeicher) "noch kein Plan" anzeigen.
  const [plansReady, setPlansReady] = useState(() => store.loadPlans().length > 0);
  const [lastPlanDayId, setLastPlanDayId] = useState<string | null>(() => store.getLastPlanDayId());
  const [screen, setScreen] = useState<Tab>('home');
  const [history, setHistory] = useState<HistWorkout[]>(() => store.loadHistory());
  const [summary, setSummary] = useState<WorkoutSummary | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [starting, setStarting] = useState(false);
  const [pending, setPending] = useState(() => store.loadOutbox().length);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const loaded = useRef(false);

  // Entwurf bei jeder Änderung lokal sichern.
  useEffect(() => {
    if (!loaded.current) {
      loaded.current = true;
      return;
    }
    if (draft) store.saveDraft(draft);
    else store.clearDraft();
  }, [draft, store]);

  const refreshPlans = useCallback(
    async (known: ExerciseListItem[]) => {
      const names = Object.fromEntries(known.map((x) => [x.id, x.name]));
      const res = await fetchPlans(names);
      if (res.ok) {
        setPlans(res.data);
        store.savePlans(res.data);
      }
      setPlansReady(true);
      return res;
    },
    [store],
  );

  const sync = useCallback(async () => {
    const res = await flushOutbox(store);
    setPending(res.pending);
    if (res.sent > 0) setNotice(`${res.sent} Training(s) gespeichert.`);
    const list = await fetchExercises();
    if (list.ok) {
      setExercises(list.data);
      store.saveExercises(list.data);
    }
    await refreshPlans(list.ok ? list.data : store.loadExercises());
    const hist = await fetchHistory();
    if (hist.ok) {
      setHistory(hist.data);
      store.saveHistory(hist.data);
    }
    // Ungesendete Trainings sind lokal aktueller als der Server.
    if (res.pending === 0) {
      const last = await fetchLastPlanDayId();
      if (last.ok && last.data) {
        store.setLastPlanDayId(last.data);
        setLastPlanDayId(last.data);
      }
    }
  }, [store, refreshPlans]);

  // Anmeldung prüfen und auf Änderungen hören.
  useEffect(() => {
    void getSessionEmail().then(setEmail);
    if (!supabase) return;
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setEmail(session?.user.email ?? null);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  // Nach Anmeldung und wenn die Verbindung zurückkommt: Ausgangskorb senden.
  useEffect(() => {
    if (!email) return;
    void sync();
    const onOnline = () => void sync();
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, [email, sync]);

  const loadLast = useCallback(
    async (exerciseId: string, isNew: boolean): Promise<LastInfo> => {
      const cached: LastInfo = {
        sets: store.getLastSets(exerciseId),
        equipmentKg: store.getLastEquipment(exerciseId),
      };
      if (isNew) return cached;
      // Liegen ungesendete Trainings vor, ist der lokale Stand aktueller als der Server.
      if (!navigator.onLine || (store.loadOutbox().length > 0 && cached.sets.length > 0)) return cached;
      const res = await withTimeout(fetchLastSets(exerciseId), 4000);
      if (res && res.ok && res.data.sets.length > 0) {
        store.setLastSets(exerciseId, res.data.sets);
        store.setLastEquipment(exerciseId, res.data.equipmentKg);
        return res.data;
      }
      return cached;
    },
    [store],
  );

  async function finish() {
    if (!draft) return;
    const finishedAt = new Date();
    const payload = buildPayload(draft, finishedAt);
    if (!payload) {
      setDraft(null);
      return;
    }
    setBusy(true);
    let saved = store.enqueue(payload);
    if (!saved) {
      // Lokaler Speicher gesperrt: direkt senden.
      const res = await syncPayload(payload);
      saved = res.ok;
    }
    if (!saved) {
      setBusy(false);
      setNotice('Speichern fehlgeschlagen. Das Training bleibt geöffnet, bitte später erneut versuchen.');
      return;
    }
    for (const e of draft.exercises) {
      const done = doneSetsAsLogged(e);
      if (done.length > 0) {
        store.setLastSets(e.exerciseId, done);
        store.setLastEquipment(e.exerciseId, e.equipmentKg);
      }
    }
    if (draft.planDayId) {
      store.setLastPlanDayId(draft.planDayId);
      setLastPlanDayId(draft.planDayId);
    }
    // Auswertung direkt nach dem Speichern, auch offline (nur lokale Daten).
    const current = draftToHist(draft, finishedAt);
    const byId = new Map<string, DraftExercise>(draft.exercises.map((e) => [e.exerciseId, e] as const));
    setSummary(
      summarizeWorkout(current, mergedHistory, {
        nameOf: (id) => byId.get(id)?.name ?? exerciseMeta[id]?.name ?? 'Übung',
        muscleOf: (id) => ({
          primary: byId.get(id)?.primaryMuscles ?? exerciseMeta[id]?.primary ?? [],
          secondary: byId.get(id)?.secondaryMuscles ?? exerciseMeta[id]?.secondary ?? [],
        }),
        rangeOf: (id) => {
          const e = byId.get(id);
          return e ? { repMin: e.repMin, repMax: e.repMax } : null;
        },
      }),
    );
    setDraft(null);
    setPending(store.loadOutbox().length);
    setBusy(false);
    void sync();
  }

  // Name und Muskeln je Übung: Katalog plus eigene Übungen, die noch nicht in der Datenbank sind.
  const exerciseMeta = useMemo(() => {
    const meta: Record<string, ExerciseMeta> = {};
    for (const x of exercises) {
      meta[x.id] = { name: x.name, primary: x.primaryMuscles ?? [], secondary: x.secondaryMuscles ?? [] };
    }
    for (const p of store.loadOutbox()) {
      for (const n of p.newExercises) {
        meta[n.id] = { name: n.name_de, primary: n.primary_muscles, secondary: n.secondary_muscles };
      }
    }
    return meta;
    // pending ändert sich mit dem Ausgangskorb
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exercises, pending, store]);

  // Verlauf aus der Datenbank plus noch nicht gesendete Trainings.
  const mergedHistory = useMemo(
    () => mergeHistory(history, store.loadOutbox()),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [history, pending, store],
  );

  const exercisesById = useMemo(
    () => Object.fromEntries(exercises.map((x) => [x.id, x])),
    [exercises],
  );

  async function startFromPlan(plan: Plan, dayId: string) {
    const day = plan.days.find((d) => d.id === dayId);
    if (!day) return;
    setStarting(true);
    setNotice(null);
    const ids = [...new Set(visibleExercises(day).map((e) => e.exerciseId))];
    const entries = await Promise.all(ids.map(async (id) => [id, await loadLast(id, false)] as const));
    setDraft(
      draftFromPlanDay(
        day,
        exercisesById,
        Object.fromEntries(entries.map(([id, info]) => [id, info.sets])),
        new Date(),
        Object.fromEntries(entries.map(([id, info]) => [id, info.equipmentKg])),
      ),
    );
    setScreen('home');
    setStarting(false);
  }

  async function handleSavePlan(plan: Plan): Promise<string | null> {
    const res = await savePlanRows(planToRows(plan, new Date()));
    if (!res.ok) return `Speichern fehlgeschlagen: ${res.error}`;
    const list = await fetchExercises();
    if (list.ok) {
      setExercises(list.data);
      store.saveExercises(list.data);
    }
    const refreshed = await refreshPlans(list.ok ? list.data : exercises);
    if (!refreshed.ok) {
      // Plan ist gespeichert, nur das Neuladen schlug fehl: lokal übernehmen.
      const saved = markSaved(plan);
      const next = plans.some((p) => p.id === saved.id)
        ? plans.map((p) => (p.id === saved.id ? saved : p))
        : [...plans, saved];
      setPlans(next);
      store.savePlans(next);
    }
    return null;
  }

  async function handleArchivePlan(planId: string): Promise<string | null> {
    const res = await archivePlan(planId);
    if (!res.ok) return `Archivieren fehlgeschlagen: ${res.error}`;
    const next = plans.filter((p) => p.id !== planId);
    setPlans(next);
    store.savePlans(next);
    return null;
  }

  if (!supabase) {
    return (
      <main className="screen">
        <h1>Gym-Log</h1>
        <p className="error" role="alert">
          {configError ?? 'Supabase ist nicht konfiguriert.'}
        </p>
      </main>
    );
  }

  if (email === undefined) {
    return (
      <main className="screen">
        <p className="muted">Lade …</p>
      </main>
    );
  }

  if (email === null) return <Login />;

  if (draft) {
    return (
      <main>
        {notice && (
          <p className="notice" role="status">
            {notice}
          </p>
        )}
        <WorkoutScreen
          draft={draft}
          exercises={exercises}
          onUpdate={(fn) => setDraft((d) => (d ? fn(d) : d))}
          loadLast={loadLast}
          onFinish={() => void finish()}
          onDiscard={() => setDraft(null)}
          busy={busy}
        />
      </main>
    );
  }

  if (summary) {
    return (
      <main>
        <WorkoutSummaryScreen summary={summary} onDone={() => setSummary(null)} />
      </main>
    );
  }

  const tabs = editorOpen ? null : <TabBar active={screen} onChange={setScreen} />;

  if (screen === 'history') {
    return (
      <main>
        <HistoryScreen workouts={mergedHistory} meta={exerciseMeta} />
        {tabs}
      </main>
    );
  }

  if (screen === 'plans') {
    return (
      <main>
        <PlansScreen
          plans={plans}
          exercises={exercises}
          onSave={handleSavePlan}
          onArchive={handleArchivePlan}
          onStart={(plan, dayId) => void startFromPlan(plan, dayId)}
          onEditingChange={setEditorOpen}
          loadLast={loadLast}
        />
        {tabs}
      </main>
    );
  }

  const fullPlans = plans.filter((p) => p.kind === 'plan');
  const templates = plans.filter((p) => p.kind === 'template');

  return (
    <main>
      <div className="screen">
        <header className="pagehead">
          <div>
            <p className="eyebrow">
              {new Date().toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' })}
            </p>
            <h1>Training</h1>
          </div>
        </header>

        {notice && (
          <p className="notice" role="status">
            {notice}
          </p>
        )}
        {pending > 0 && (
          <p className="notice" role="status">
            {pending} Training(s) noch nicht gespeichert. Sie werden gesendet, sobald eine
            Verbindung besteht.{' '}
            <button type="button" className="link" onClick={() => void sync()}>
              Jetzt versuchen
            </button>
          </p>
        )}

        {fullPlans.map((plan) => {
          const days = visibleDays(plan);
          const next = nextPlanDay(
            days.map((d, i) => ({ id: d.id, position: i })),
            lastPlanDayId,
          );
          const nextDay = days.find((d) => d.id === next?.id);
          if (!nextDay) return null;
          const n = visibleExercises(nextDay).length;
          const muscles = musclesOfDay(nextDay, exercises);
          return (
            <section className="hero" key={plan.id}>
              <p className="eyebrow">{plan.name} · als Nächstes</p>
              <h2>{nextDay.name}</h2>
              <p className="hero-sub">
                {n} {n === 1 ? 'Übung' : 'Übungen'}
                {muscles && ` · ${muscles}`}
              </p>
              <button
                type="button"
                className="btn primary block"
                disabled={starting}
                onClick={() => void startFromPlan(plan, nextDay.id)}
              >
                <Icon name="play" size={18} /> {starting ? 'Lade …' : 'Training starten'}
              </button>
              {days.length > 1 && (
                <div className="chips scroll">
                  {days
                    .filter((d) => d.id !== nextDay.id)
                    .map((d) => (
                      <button
                        key={d.id}
                        type="button"
                        className="chip"
                        disabled={starting}
                        onClick={() => void startFromPlan(plan, d.id)}
                      >
                        {d.name}
                      </button>
                    ))}
                </div>
              )}
            </section>
          );
        })}

        {templates.length > 0 && (
          <>
            <h2 className="section-title">Vorlagen</h2>
            <ul className="tiles">
              {templates.map((t) => {
                const day = templateDay(t);
                if (!day) return null;
                const n = visibleExercises(day).length;
                const muscles = musclesOfDay(day, exercises);
                return (
                  <li key={t.id}>
                    <button
                      type="button"
                      className="tile"
                      disabled={starting || n === 0}
                      onClick={() => void startFromPlan(t, day.id)}
                    >
                      <span className="tile-title">
                        <strong>{t.name}</strong>
                        <small>
                          {n} {n === 1 ? 'Übung' : 'Übungen'}
                          {muscles && ` · ${muscles}`}
                        </small>
                      </span>
                      <Icon name="play" size={20} />
                    </button>
                  </li>
                );
              })}
            </ul>
          </>
        )}

        {plans.length === 0 && plansReady && (
          <div className="empty-state">
            <Icon name="list" size={32} />
            <p>Noch kein Plan und keine Vorlage.</p>
            <p className="muted">Lege unter „Pläne" deine erste Vorlage an, oder starte direkt ein freies Training.</p>
            <button type="button" className="btn compact" onClick={() => setScreen('plans')}>
              Zu den Plänen
            </button>
          </div>
        )}

        <button
          type="button"
          className="addtile"
          onClick={() => {
            setNotice(null);
            setDraft(createDraft('Freies Training', null, new Date()));
          }}
        >
          <Icon name="plus" size={20} /> Freies Training
        </button>

        <p className="muted footnote">
          Angemeldet als {email} ·{' '}
          <button type="button" className="link" onClick={() => void signOut()}>
            Abmelden
          </button>
        </p>
      </div>
      {tabs}
    </main>
  );
}

function Login() {
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [mail, setMail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [resendAt, setResendAt] = useState(0);
  const [now, setNow] = useState(() => Date.now());

  // Sperrzeit für "Erneut senden", damit das E-Mail-Limit von Supabase nicht ausgereizt wird.
  useEffect(() => {
    if (resendAt <= Date.now()) return;
    const id = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(id);
  }, [resendAt]);
  const wait = Math.max(0, Math.ceil((resendAt - now) / 1000));

  async function send(e?: FormEvent) {
    e?.preventDefault();
    setBusy(true);
    setError(null);
    const res = await sendLoginLink(mail.trim());
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setStep('code');
    setCode('');
    setNow(Date.now());
    setResendAt(Date.now() + 60_000);
  }

  async function verify(e: FormEvent) {
    e.preventDefault();
    const token = normalizeCode(code);
    if (!token) {
      setError('Der Code besteht aus 6 bis 10 Ziffern.');
      return;
    }
    setBusy(true);
    setError(null);
    const res = await verifyLoginCode(mail.trim(), token);
    if (!res.ok) setError(res.error);
    setBusy(false);
  }

  async function passwordLogin(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await signIn(mail.trim(), password);
    if (!res.ok) setError(res.error);
    setBusy(false);
  }

  return (
    <main className="screen">
      <h1>Gym-Log</h1>

      {step === 'email' ? (
        <form className="card" onSubmit={(e) => void send(e)}>
          <label>
            E-Mail
            <input
              className="text"
              type="email"
              autoComplete="username"
              value={mail}
              onChange={(e) => setMail(e.target.value)}
              required
            />
          </label>
          <button type="submit" className="btn primary" disabled={busy}>
            {busy ? 'Sende …' : 'Anmeldelink senden'}
          </button>
        </form>
      ) : (
        <form className="card" onSubmit={(e) => void verify(e)}>
          <p>
            Wir haben eine E-Mail an <strong>{mail.trim()}</strong> geschickt.
          </p>
          <p className="muted">
            Tippe auf den Link in der Mail. Steht in der Mail zusätzlich ein Code, kannst du ihn
            hier eingeben. Das ist nötig in der App vom iPhone-Home-Bildschirm, denn der Link
            öffnet dort Safari und nicht diese App.
          </p>
          <label>
            Code aus der E-Mail
            <input
              className="text"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
          </label>
          <button type="submit" className="btn primary" disabled={busy}>
            {busy ? 'Prüfe …' : 'Code bestätigen'}
          </button>
          <div className="row wrap">
            <button
              type="button"
              className="link"
              disabled={busy || wait > 0}
              onClick={() => void send()}
            >
              {wait > 0 ? `Erneut senden (${wait} s)` : 'Erneut senden'}
            </button>
            <button
              type="button"
              className="link"
              onClick={() => {
                setStep('email');
                setError(null);
              }}
            >
              Andere Adresse
            </button>
          </div>
        </form>
      )}

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      {step === 'email' && (
        <details className="equipment">
          <summary>Mit Passwort anmelden</summary>
          <form onSubmit={(e) => void passwordLogin(e)}>
            <label>
              Passwort
              <input
                className="text"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
            <button type="submit" className="btn" disabled={busy || mail.trim() === '' || password === ''}>
              Mit Passwort anmelden
            </button>
          </form>
        </details>
      )}
    </main>
  );
}
