"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api } from "./api";
import { SAMPLE_CLASSES, sampleRoster, sampleRunReport } from "./teacher-sample-data";

const KEY = "cogna_teacher_sample_data";

/** `ready` is false until the saved choice is read; nothing should load before then, or real data can flash during a demo. */
type SampleMode = { sample: boolean; ready: boolean; setSample: (on: boolean) => void };

const SampleModeContext = createContext<SampleMode>({ sample: false, ready: true, setSample: () => undefined });

/** The teacher dashboard's "Sample data" switch: per browser, off by default. */
export function SampleModeProvider({ children }: { children: React.ReactNode }) {
  const [sample, setSampleState] = useState(false);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    try {
      setSampleState(localStorage.getItem(KEY) === "on");
    } catch {
      /* storage unavailable: stay on real data */
    }
    setReady(true);
  }, []);
  const setSample = useCallback((on: boolean) => {
    setSampleState(on);
    try {
      localStorage.setItem(KEY, on ? "on" : "off");
    } catch {
      /* the switch still works for this visit */
    }
  }, []);
  return <SampleModeContext.Provider value={{ sample, ready, setSample }}>{children}</SampleModeContext.Provider>;
}

export function useSampleMode(): SampleMode {
  return useContext(SampleModeContext);
}

/** What teacher pages read, from the API or from the sample classes. */
export function teacherData(sample: boolean) {
  return sample
    ? {
        listClassrooms: async () => SAMPLE_CLASSES,
        getClassroomRunReport: async (runId: string) => sampleRunReport(runId),
        getClassRoster: async (classroomId: string) => sampleRoster(classroomId),
      }
    : {
        listClassrooms: api.listClassrooms,
        getClassroomRunReport: api.getClassroomRunReport,
        getClassRoster: api.getClassRoster,
      };
}

export const SAMPLE_ACTION_NOTE = "This is sample data, so nothing was changed. Turn off Sample data to work with your real classes.";
