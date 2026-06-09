import { useEffect, useRef, useState, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, apiForm, downloadUrl } from "../../api/client";
import { Layout, Card, Button } from "../../components/Layout";
import { assessmentTopicLabel } from "../../utils/assessment";
import { ReattemptRequestPanel } from "../../components/ReattemptRequestPanel";
import { ProctoringInstructions } from "../../components/proctoring/ProctoringInstructions";
import { ProctoringHud } from "../../components/proctoring/ProctoringHud";
import { useProctoring } from "../../components/proctoring/useProctoring";

interface Question {
  id: string;
  stem: string;
  options: string[];
  questionType: "single" | "multi";
  correctIndices?: number[];
  explanation?: string | null;
  selectedIndices?: number[];
  pointsEarned?: number;
  isFullyCorrect?: boolean;
}

type AnswersMap = Record<string, number[]>;

interface AssessmentDetail {
  status: string;
  passMark: number;
  displayName?: string | null;
  proctoringInstructions?: string | null;
  proctoringPhotoIntervalMinutes?: number;
  topics?: { topic: { name: string } }[];
  attempts: { id: string; status: string; score: number | null; completedAt?: string | null }[];
}

interface AttemptSummary {
  id: string;
  score: number | null;
  status: string;
  startedAt: string;
  completedAt: string | null;
  attemptNumber: number;
  passed: boolean;
  certNumber?: string | null;
  certificate?: { certNumber: string } | null;
}

interface ResultPayload {
  passMark: number;
  issueCertificate?: boolean;
  revealAnswers: boolean;
  attempt: {
    id: string;
    score: number | null;
    completedAt: string | null;
    certificate?: { certNumber: string; proficiency?: string } | null;
  };
  attempts: AttemptSummary[];
  questions?: Question[];
}

function toggleMultiAnswer(current: number[], index: number): number[] {
  const set = new Set(current);
  if (set.has(index)) set.delete(index);
  else set.add(index);
  return [...set].sort((a, b) => a - b);
}

function CompletedResults({ id, summary }: { id: string; summary: AssessmentDetail }) {
  const [viewAttemptId, setViewAttemptId] = useState<string | undefined>(undefined);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["assessment-result", id, viewAttemptId],
    queryFn: () =>
      api<ResultPayload>(
        `/assessments/${id}/result${viewAttemptId ? `?attemptId=${viewAttemptId}` : ""}`
      ),
  });

  const attemptHistory =
    data?.attempts ??
    [...summary.attempts]
      .filter((t) => t.status === "completed" || t.status === "timed_out")
      .sort((x, y) => {
        const dx = x.completedAt ? new Date(x.completedAt).getTime() : 0;
        const dy = y.completedAt ? new Date(y.completedAt).getTime() : 0;
        return dy - dx;
      })
      .map((t, i, arr) => ({
        id: t.id,
        score: t.score,
        status: t.status,
        startedAt: "",
        completedAt: t.completedAt ?? null,
        attemptNumber: arr.length - i,
        passed: t.score != null && t.score >= summary.passMark,
        certNumber: null,
      }));

  const latest = attemptHistory[0];
  const score = data?.attempt?.score ?? latest?.score ?? null;
  const passMark = data?.passMark ?? summary.passMark;
  const passed = score !== null && score >= passMark;

  if (isLoading && score === null) {
    return (
      <Layout nav={[{ to: "/dashboard", label: "Dashboard" }]}>
        <p className="text-sm text-slate-500">Loading results…</p>
      </Layout>
    );
  }

  return (
    <Layout nav={[{ to: "/dashboard", label: "Dashboard" }]}>
      <Card title={assessmentTopicLabel(summary)}>
        {score !== null ? (
          <>
            <p className="text-2xl font-semibold mb-2">Score: {score}%</p>
            <p className={`mb-2 ${passed ? "text-green-600" : "text-red-600"}`}>
              {passed ? "Passed" : `Did not pass (pass mark ${passMark}%)`}
            </p>
          </>
        ) : (
          <p className="text-slate-500 mb-2">No score recorded.</p>
        )}
        {data?.attempt?.completedAt && (
          <p className="text-xs text-slate-500 mb-2">
            Latest attempt completed {new Date(data.attempt.completedAt).toLocaleString()}
          </p>
        )}

        {attemptHistory.length > 0 && (
          <div className="mb-4 rounded-lg border border-slate-200 overflow-hidden">
            <p className="text-xs font-semibold text-slate-600 bg-slate-50 px-3 py-2 border-b border-slate-200">
              Attempt history ({attemptHistory.length})
            </p>
            <ul className="divide-y divide-slate-100 text-sm">
              {attemptHistory.map((a) => (
                <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                  <span>
                    Attempt {a.attemptNumber}
                    {a.id === latest?.id && (
                      <span className="ml-1 text-xs text-indigo-600 font-medium">(latest)</span>
                    )}
                  </span>
                  <span className="flex items-center gap-2">
                    <span className={a.passed ? "text-green-600" : "text-red-600"}>
                      {a.score ?? "—"}%
                    </span>
                    {a.completedAt && (
                      <span className="text-xs text-slate-400">
                        {new Date(a.completedAt).toLocaleDateString()}
                      </span>
                    )}
                    {a.certNumber && (
                      <span className="text-xs text-green-700 font-medium">{a.certNumber}</span>
                    )}
                    {attemptHistory.length > 1 && data?.revealAnswers && (
                      <button
                        type="button"
                        className="text-xs text-indigo-600 hover:underline"
                        onClick={() => setViewAttemptId(a.id)}
                      >
                        {viewAttemptId === a.id || (!viewAttemptId && a.id === latest?.id)
                          ? "Viewing"
                          : "Review"}
                      </button>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {passed && data?.issueCertificate && data.attempt?.certificate?.certNumber && (
          <div className="mb-4 rounded-lg border border-green-200 bg-green-50 px-4 py-3">
            <p className="font-medium text-green-900 mb-1">Certificate issued</p>
            <p className="text-sm text-green-800 font-mono mb-2">
              {data.attempt.certificate.certNumber}
              {data.attempt.certificate.proficiency && (
                <span className="ml-2 font-sans text-green-700">
                  · {data.attempt.certificate.proficiency.replace(/_/g, " ")}
                </span>
              )}
            </p>
            <a
              href={downloadUrl(`/certificates/${data.attempt.certificate.certNumber}/pdf`)}
              className="text-sm font-medium text-indigo-700 hover:underline"
            >
              Download certificate (PDF)
            </a>
            <p className="text-xs text-slate-500 mt-2">
              Also available on your{" "}
              <Link to="/profile" className="text-indigo-600 hover:underline">
                profile
              </Link>
              .
            </p>
          </div>
        )}
        {passed && data?.issueCertificate && !data.attempt?.certificate?.certNumber && (
          <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-4">
            You passed, but no certificate is linked to this attempt yet. Refresh the page or check your profile.
          </p>
        )}
        {isError && (
          <p className="text-sm text-amber-700 mb-4">{(error as Error).message}</p>
        )}
        {data?.revealAnswers && data.questions && data.questions.length > 0 && (
          <div className="border-t border-slate-200 pt-4 mt-4 space-y-4">
            <h3 className="font-medium text-slate-800">Answer review</h3>
            <p className="text-xs text-slate-500">
              Each question counts equally. Single-choice: one correct option. Multi-select with
              all-or-nothing: you must select the full correct set to earn the point.
            </p>
            {data.questions.map((q, i) => (
              <div key={q.id} className="text-sm border border-slate-100 rounded-lg p-3">
                <p className="font-medium mb-2">
                  Q{i + 1}. {q.stem}{" "}
                  <span className={q.isFullyCorrect ? "text-green-600" : "text-red-600"}>
                    ({q.pointsEarned ?? 0} pt)
                  </span>
                </p>
                <ul className="space-y-1 mb-2">
                  {(q.options as string[]).map((opt, idx) => {
                    const selected = (q.selectedIndices ?? []).some((si) => Number(si) === idx);
                    const correct = (q.correctIndices ?? []).some((ci) => Number(ci) === idx);
                    const wrongPick = selected && !correct;
                    return (
                      <li
                        key={idx}
                        className={`px-2 py-1 rounded ${
                          correct
                            ? "bg-green-50 text-green-800 border border-green-200"
                            : wrongPick
                              ? "bg-red-50 text-red-800 border border-red-200"
                              : ""
                        }`}
                      >
                        {opt}
                        {selected && " · your answer"}
                        {correct && !selected && " · correct answer"}
                        {correct && selected && " · correct"}
                      </li>
                    );
                  })}
                </ul>
                {q.explanation && (
                  <p className="text-xs text-slate-500 italic">{q.explanation}</p>
                )}
              </div>
            ))}
          </div>
        )}
        {!data?.revealAnswers && !isLoading && (
          <p className="text-xs text-slate-500 mb-4">Correct answers are not shown for this assessment.</p>
        )}
        <ReattemptRequestPanel assessmentId={id} assessmentStatus={summary.status} />
        <Link to="/dashboard" className="inline-block mt-4">
          <Button variant="secondary">Back to dashboard</Button>
        </Link>
      </Card>
    </Layout>
  );
}

export default function AssessmentPage() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<AnswersMap>({});
  const [currentIdx, setCurrentIdx] = useState(0);
  const [phase, setPhase] = useState<"consent" | "camera" | "test" | "review" | "done">("consent");
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [result, setResult] = useState<{ score: number; passed: boolean } | null>(null);
  const [cameraReady, setCameraReady] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const assessment = useQuery({
    queryKey: ["assessment", id],
    queryFn: () => api<AssessmentDetail>(`/assessments/${id}`),
    enabled: !!id,
  });

  // Photo interval from blueprint snapshot (default 5 min)
  const photoInterval = assessment.data?.proctoringPhotoIntervalMinutes ?? 5;

  const capturePhoto = useCallback(
    (kind: "start" | "periodic") => {
      if (!videoRef.current || !attemptId) return;
      const canvas = document.createElement("canvas");
      canvas.width = videoRef.current.videoWidth || 640;
      canvas.height = videoRef.current.videoHeight || 480;
      canvas.getContext("2d")?.drawImage(videoRef.current, 0, 0);
      canvas.toBlob(async (blob) => {
        if (!blob) return;
        const fd = new FormData();
        fd.append("photo", blob, "photo.jpg");
        fd.append("kind", kind);
        await apiForm(`/photos/attempts/${attemptId}`, fd);
      }, "image/jpeg");
    },
    [attemptId]
  );

  const { warnings, recentEvents, requestFullscreenRestore } = useProctoring(
    phase === "test",
    attemptId,
    photoInterval,
    capturePhoto
  );

  const startMutation = useMutation({
    mutationFn: () =>
      api<{ attemptId: string; questions: Question[]; timeLimitMinutes: number }>(
        `/assessments/${id}/start`,
        { method: "POST" }
      ),
    onSuccess: (data) => {
      setAttemptId(data.attemptId);
      const seen = new Set<string>();
      const unique = data.questions.filter((q) => {
        if (seen.has(q.id)) return false;
        seen.add(q.id);
        return true;
      });
      setQuestions(unique);
      if (data.timeLimitMinutes > 0) setTimeLeft(data.timeLimitMinutes * 60);
      setPhase("camera");
    },
  });

  const saveAnswers = useCallback(
    async (next: AnswersMap) => {
      if (!attemptId) return;
      await api(`/attempts/${attemptId}/answers`, { method: "PUT", json: { answers: next } });
    },
    [attemptId]
  );

  const submitMutation = useMutation({
    mutationFn: () =>
      api<{ attempt: { score: number }; passed: boolean }>(`/attempts/${attemptId}/submit`, {
        method: "POST",
      }),
    onSuccess: async (data) => {
      setResult({ score: data.attempt.score, passed: data.passed });
      // Stop camera stream
      streamRef.current?.getTracks().forEach((t) => t.stop());
      document.exitFullscreen?.().catch(() => {});
      await qc.invalidateQueries({ queryKey: ["my-assessments"] });
      await qc.invalidateQueries({ queryKey: ["assessment", id] });
      await qc.invalidateQueries({ queryKey: ["assessment-result", id] });
      const refreshed = await assessment.refetch();
      if (refreshed.data?.status !== "completed") {
        setPhase("done");
      }
    },
  });

  // Countdown timer
  useEffect(() => {
    if (phase !== "test" || timeLeft === null || !attemptId) return;
    const t = setInterval(() => {
      setTimeLeft((s) => {
        if (s === null || s <= 1) {
          submitMutation.mutate();
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [phase, timeLeft, attemptId]);

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        void videoRef.current.play().catch(() => {});
      }
      setCameraReady(true);
    } catch {
      // Camera permission denied — allow continuation without camera
      setCameraReady(true);
    }
  };

  // Camera <video> remounts when leaving setup (camera → test/review); re-bind the live stream.
  useEffect(() => {
    const video = videoRef.current;
    const stream = streamRef.current;
    if (!video || !stream) return;
    video.srcObject = stream;
    void video.play().catch(() => {});
  }, [phase]);

  const handleCaptureAndContinue = async () => {
    capturePhoto("start");
    setPhase("test");
  };

  const setAnswer = (questionId: string, next: number[]) => {
    const updated = { ...answers, [questionId]: next };
    setAnswers(updated);
    saveAnswers(updated);
  };

  if (assessment.isLoading) {
    return (
      <Layout nav={[{ to: "/dashboard", label: "Dashboard" }]}>
        <p className="text-sm text-slate-500">Loading…</p>
      </Layout>
    );
  }

  if (!assessment.data) {
    return (
      <Layout nav={[{ to: "/dashboard", label: "Dashboard" }]}>
        <Card title="Assessment not found">
          <Link to="/dashboard"><Button>Back to dashboard</Button></Link>
        </Card>
      </Layout>
    );
  }

  if (assessment.data.status === "completed") {
    return <CompletedResults id={id!} summary={assessment.data} />;
  }

  const isReattempt =
    assessment.data.status === "assigned" &&
    assessment.data.attempts.some((t) => t.status === "completed" || t.status === "timed_out");

  const assessmentLabel = assessmentTopicLabel(assessment.data);
  const current = questions[currentIdx];

  // Consent screen — full page, no layout chrome
  if (phase === "consent") {
    return (
      <ProctoringInstructions
        assessmentName={assessmentLabel}
        customInstructions={assessment.data.proctoringInstructions}
        isReattempt={isReattempt}
        loading={startMutation.isPending}
        error={startMutation.isError ? (startMutation.error as Error).message : undefined}
        onAccept={() => startMutation.mutate()}
      />
    );
  }

  // Camera setup phase
  if (phase === "camera") {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="w-full max-w-lg">
          <div className="bg-white rounded-2xl shadow-lg border border-slate-200 overflow-hidden">
            <div className="bg-indigo-600 px-6 py-4">
              <h2 className="text-white font-semibold">Identity verification</h2>
              <p className="text-indigo-200 text-sm mt-0.5">We need to take a photo before you start.</p>
            </div>
            <div className="p-6">
              <div className="bg-slate-900 rounded-xl overflow-hidden mb-4 aspect-video max-w-sm mx-auto">
                <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover scale-x-[-1]" />
              </div>
              <div className="flex gap-3 justify-center">
                {!cameraReady ? (
                  <button
                    type="button"
                    onClick={startCamera}
                    className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-medium px-5 py-2.5 rounded-xl text-sm transition-colors"
                  >
                    Enable camera
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleCaptureAndContinue}
                    className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white font-medium px-5 py-2.5 rounded-xl text-sm transition-colors"
                  >
                    Capture photo & start test
                  </button>
                )}
              </div>
              <p className="text-xs text-slate-400 text-center mt-3">
                Your photo will be stored securely for verification purposes.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Test phase — no layout chrome (fullscreen), HUD overlaid
  if (phase === "test" && current) {
    return (
      <div className="min-h-screen bg-slate-100">
        <ProctoringHud
          videoRef={videoRef}
          warnings={warnings}
          recentEvents={recentEvents}
          onRestoreFullscreen={requestFullscreenRestore}
        />

        {/* Top bar */}
        <div className="bg-white border-b border-slate-200 shadow-sm sticky top-0 z-30 px-4 py-3">
          <div className="max-w-2xl mx-auto flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm font-semibold text-slate-800">
              Question {currentIdx + 1} of {questions.length}
            </span>
            <div className="flex items-center gap-3">
              {timeLeft !== null && (
                <span
                  className={`text-sm font-mono font-semibold px-2.5 py-1 rounded-lg ${
                    timeLeft < 120 ? "bg-red-100 text-red-700" : "bg-slate-100 text-slate-700"
                  }`}
                >
                  {Math.floor(timeLeft / 60)}:{String(timeLeft % 60).padStart(2, "0")}
                </span>
              )}
              <span className="text-xs text-slate-500">
                {questions.filter((q) => (answers[q.id]?.length ?? 0) > 0).length}/{questions.length} answered
              </span>
            </div>
          </div>
          <div className="max-w-2xl mx-auto mt-2">
            <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-indigo-500 transition-all duration-300"
                style={{ width: `${((currentIdx + 1) / questions.length) * 100}%` }}
              />
            </div>
          </div>
        </div>

        {/* Question card */}
        <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
            {current.questionType === "multi" ? (
              <span className="inline-block text-xs font-medium text-indigo-700 bg-indigo-50 px-2 py-1 rounded mb-3">
                Select all that apply
              </span>
            ) : (
              <span className="inline-block text-xs font-medium text-slate-600 bg-slate-100 px-2 py-1 rounded mb-3">
                Select one answer
              </span>
            )}
            <p className="text-base text-slate-900 leading-relaxed mb-5">{current.stem}</p>
            <div className="space-y-2 mb-6">
              {(current.options as string[]).map((opt, i) => {
                const selected = answers[current.id] ?? [];
                const isChecked = selected.includes(i);
                const letter = String.fromCharCode(65 + i);
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => {
                      if (current.questionType === "multi") {
                        setAnswer(current.id, toggleMultiAnswer(selected, i));
                      } else {
                        setAnswer(current.id, [i]);
                      }
                    }}
                    className={`w-full text-left flex items-start gap-3 p-4 rounded-xl border-2 transition-all ${
                      isChecked
                        ? "border-indigo-500 bg-indigo-50 shadow-sm"
                        : "border-slate-200 bg-white hover:border-indigo-300 hover:bg-slate-50"
                    }`}
                  >
                    <span
                      className={`shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold ${
                        isChecked ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-600"
                      }`}
                    >
                      {letter}
                    </span>
                    <span className="text-sm text-slate-800 pt-1">{opt}</span>
                  </button>
                );
              })}
            </div>

            {/* Question nav dots */}
            <div className="flex flex-wrap gap-1.5 mb-6 p-3 bg-slate-50 rounded-lg">
              {questions.map((q, i) => (
                <button
                  key={q.id}
                  type="button"
                  onClick={() => setCurrentIdx(i)}
                  title={`Question ${i + 1}`}
                  className={`min-w-8 h-8 px-1 text-xs font-medium rounded-lg transition-colors ${
                    i === currentIdx
                      ? "bg-indigo-600 text-white"
                      : (answers[q.id]?.length ?? 0) > 0
                        ? "bg-indigo-100 text-indigo-800 hover:bg-indigo-200"
                        : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  {i + 1}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap gap-2 justify-between pt-2 border-t border-slate-100">
              <Button variant="secondary" disabled={currentIdx === 0} onClick={() => setCurrentIdx((i) => i - 1)}>
                Previous
              </Button>
              {currentIdx < questions.length - 1 ? (
                <Button onClick={() => setCurrentIdx((i) => i + 1)}>Next question</Button>
              ) : (
                <Button onClick={() => setPhase("review")}>Review & submit</Button>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Review phase
  if (phase === "review") {
    return (
      <div className="min-h-screen bg-slate-100">
        <ProctoringHud
          videoRef={videoRef}
          warnings={warnings}
          recentEvents={recentEvents}
          onRestoreFullscreen={requestFullscreenRestore}
        />
        <div className="max-w-2xl mx-auto px-4 py-8">
          <Card title="Review before submit">
            <p className="text-sm text-slate-600 mb-4">
              {questions.filter((q) => (answers[q.id]?.length ?? 0) > 0).length} of {questions.length}{" "}
              questions answered. You can go back to change answers before submitting.
            </p>
            <ul className="text-sm space-y-2 mb-6 max-h-64 overflow-y-auto">
              {questions.map((q, i) => {
                const answered = (answers[q.id]?.length ?? 0) > 0;
                return (
                  <li
                    key={q.id}
                    className={`flex justify-between items-center gap-2 px-3 py-2 rounded-lg border ${
                      answered ? "border-slate-200 bg-slate-50" : "border-amber-200 bg-amber-50"
                    }`}
                  >
                    <span className="truncate flex-1">
                      <span className="font-medium text-slate-700">Q{i + 1}.</span>{" "}
                      {q.stem.slice(0, 80)}{q.stem.length > 80 ? "…" : ""}
                    </span>
                    <button
                      type="button"
                      className="text-xs text-indigo-600 shrink-0 hover:underline"
                      onClick={() => { setCurrentIdx(i); setPhase("test"); }}
                    >
                      {answered ? "Edit" : "Answer"}
                    </button>
                  </li>
                );
              })}
            </ul>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={() => setPhase("test")}>Back to questions</Button>
              <Button onClick={() => submitMutation.mutate()} disabled={submitMutation.isPending}>
                {submitMutation.isPending ? "Submitting…" : "Submit assessment"}
              </Button>
            </div>
          </Card>
        </div>
      </div>
    );
  }

  // Done phase (fallback before redirect to completed)
  if (phase === "done" && result) {
    return (
      <Layout nav={[{ to: "/dashboard", label: "Dashboard" }]}>
        <Card title="Submitted">
          <p className="text-2xl font-semibold mb-2">Score: {result.score}%</p>
          <p className={`mb-4 ${result.passed ? "text-green-600" : "text-red-600"}`}>
            {result.passed ? "Passed" : "Did not pass"}
          </p>
          <Link to="/dashboard"><Button>Back to dashboard</Button></Link>
        </Card>
      </Layout>
    );
  }

  return (
    <Layout nav={[{ to: "/dashboard", label: "Dashboard" }]}>
      <p className="text-sm text-slate-500">Loading…</p>
    </Layout>
  );
}
