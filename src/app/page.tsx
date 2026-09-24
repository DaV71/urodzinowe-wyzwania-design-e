// Strona jubilata. Bez cookie gracza: tylko zaklejona koperta (bez imienia, liczb i tytułów zadań).
import type { Metadata } from "next";
import { site } from "@/config/site";
import { Cake } from "@/components/Cake";
import { EnvelopeActive } from "@/components/EnvelopeActive";
import { EnvelopeDone } from "@/components/EnvelopeDone";
import { EnvelopeLocked } from "@/components/EnvelopeLocked";
import { Footer } from "@/components/Footer";
import { GiftLocked } from "@/components/GiftLocked";
import { GiftUnlocked } from "@/components/GiftUnlocked";
import { Hero } from "@/components/Hero";
import { ProgressPill } from "@/components/ProgressPill";
import { StageHeader } from "@/components/StageHeader";
import { TopBar } from "@/components/TopBar";
import { isPlayer } from "@/lib/auth/player";
import { getBoard, type BoardTask } from "@/lib/progress";
import styles from "./page.module.css";

const GENERIC_TITLE = "Urodzinowe wyzwania";

// Nadpisuje tytuł/opis z layoutu, żeby bez dostępu HTML nie zawierał imienia ani liczb.
export async function generateMetadata(): Promise<Metadata> {
  const robots = { index: false, follow: false };
  if (!(await isPlayer())) return { title: GENERIC_TITLE, description: null, robots };
  return { robots };
}

function Envelope({ task }: { task: BoardTask }) {
  switch (task.status) {
    case "DONE":
      return <EnvelopeDone n={task.id} title={task.title ?? ""} />;
    case "ACTIVE":
    case "PENDING_REVIEW":
      return <EnvelopeActive task={task} />;
    default:
      return <EnvelopeLocked n={task.id} />;
  }
}

function LockedPage() {
  return (
    <main className={styles.page}>
      <TopBar dateLabel="Birthday Run" />
      <div className={styles.lockedOnly}>
        <EnvelopeLocked message="Ta strona otwiera się tylko z właściwym linkiem." />
      </div>
    </main>
  );
}

export default async function Home() {
  if (!(await isPlayer())) return <LockedPage />;

  // getBoard sam wywołuje ensureStarted (pierwsze wejście odblokowuje kopertę 1).
  const board = await getBoard();
  const { done, total, tasks } = board;
  const stages = site.stages.map((name, i) => ({
    index: i + 1,
    name,
    tasks: tasks.filter((t) => t.stage === i + 1),
  }));

  return (
    <main className={styles.page}>
      <TopBar dateLabel={site.dateLabel} />
      <div className={styles.layout}>
        <div className={styles.cake}>
          <Cake done={done} total={total} age={site.age} />
          <ProgressPill done={done} total={total} />
        </div>

        <div className={styles.hero}>
          <Hero name={site.name} total={total} />
        </div>

        <section className={styles.list} aria-labelledby="envelopes-heading">
          <div className={styles.listHeader}>
            <h2 id="envelopes-heading" className={styles.listTitle}>
              Koperty
            </h2>
            <span className={styles.listCount}>
              {done} / {total} zaliczone
            </span>
          </div>
          {stages.map((stage) => (
            <div key={stage.index} className={styles.stage}>
              <StageHeader index={stage.index} name={stage.name} />
              {stage.tasks.map((task) => (
                <Envelope key={task.id} task={task} />
              ))}
            </div>
          ))}
        </section>

        <div className={styles.gift}>
          {done >= total ? (
            <GiftUnlocked title={site.rewardTitle} description={site.rewardDescription} />
          ) : (
            <GiftLocked left={total - done} />
          )}
        </div>

        <div className={styles.footer}>
          <Footer from={site.from} />
        </div>
      </div>
    </main>
  );
}
