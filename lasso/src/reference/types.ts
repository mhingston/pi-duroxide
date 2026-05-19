export interface LocalPrBundle {
  repoPath: string;
  sourceBranch: string;
  targetBranch: string;
  reviewInstructions: string;
  verificationCommands: string[];
}

export type LocalCandidateSource =
  | { kind: "branch"; value: string }
  | { kind: "patchFile"; value: string };

export interface LocalPatchValidationBundle {
  /** Absolute path to the local repository to validate against */
  repoPath: string;
  /** Git ref to check out as the baseline before applying the candidate */
  baselineRef: string;
  /** The candidate fix to validate — a branch or a patch file */
  candidateSource: LocalCandidateSource;
  /** Commands that reproduce the bug; expected to fail on baseline, pass after fix */
  reproduceCommands: string[];
  /** Commands that must still pass after the fix is applied (regression guard) */
  verificationCommands: string[];
  /** Instructions for the LLM summary / human review prompt */
  reviewInstructions: string;
  /** When true, a human approval gate is inserted before the validated-fix terminal */
  approvalRequired: boolean;
}
