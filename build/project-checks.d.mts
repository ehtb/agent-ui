/** The finding of a check: what is wrong and what to write instead, as two plain sentences. The report is `where: problem. fix`. */
export interface ProjectCheckFinding {
  problem: string;
  fix: string;
}
export interface ProjectCheckContext {
  /** The node of the finished spec: a plain object (`tag`, `props`, `children`, `id`, ...). */
  node: Record<string, any>;
  /** The name of the component whose definition wrote the node, or null when it was written directly in a view or a layout. */
  madeBy: string | null;
  /** The node that holds this one, or null for the root. */
  parent: Record<string, any> | null;
  /** Where the node is, for example `$.children[2].children[0]`. */
  path: string;
  /** Whose spec it is. */
  where: 'page' | 'shell';
}
export interface ProjectCheck {
  /** Lower-case words joined by dashes; the report shows it. */
  name: string;
  /** Called for every node of every page and shell; return nothing, or what is wrong. */
  node: (context: ProjectCheckContext) => ProjectCheckFinding | ProjectCheckFinding[] | false | null | undefined | void;
}
/** Fails a tag that a page writes directly (not inside a component's own definition), with what to write instead. */
export function forbidTags(tags: Record<string, string>, name?: string): ProjectCheck;
/** The sentences that say what is wrong with a `checks` option (empty when it is fine). */
export function checkProjectChecks(checks: unknown): string[];
/** Runs the checks over one finished spec and returns the problems as sentences. */
export function runProjectChecks(checks: ProjectCheck[] | undefined, options: { spec: object; file: string; where?: 'page' | 'shell'; owner?: string }): string[];
/** The checks over one page's finished spec and, the first time its shell is met (`checkedShells` is kept by the caller), the shell's content. */
export function runPageChecks(checks: ProjectCheck[] | undefined, options: { module: { spec: object; shellContent?: { view: object } | null; shellName?: string | null }; file: string; checkedShells: Set<string> }): string[];
