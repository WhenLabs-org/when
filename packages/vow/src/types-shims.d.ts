declare module 'spdx-license-ids' {
  const ids: string[];
  export default ids;
}

declare module 'spdx-license-list' {
  const list: Record<string, {
    name: string;
    url: string;
    osiApproved: boolean;
  }>;
  export default list;
}

declare module 'spdx-expression-parse' {
  interface LicenseNode {
    license: string;
    plus?: boolean;
    exception?: string;
  }

  interface ConjunctionNode {
    conjunction: 'and' | 'or';
    left: LicenseNode | ConjunctionNode;
    right: LicenseNode | ConjunctionNode;
  }

  type SpdxExpression = LicenseNode | ConjunctionNode;

  function parse(expr: string): SpdxExpression;
  export default parse;
}

declare module 'spdx-satisfies' {
  function satisfies(expr: string, allowedExpr: string): boolean;
  export default satisfies;
}
