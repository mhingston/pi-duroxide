export interface LocalPrBundle {
  repoPath: string;
  sourceBranch: string;
  targetBranch: string;
  reviewInstructions: string;
  verificationCommands: string[];
}
