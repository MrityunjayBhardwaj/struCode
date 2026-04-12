import { StrudelEditorDynamic } from "../components/EditorWrapper";

export default function Home() {
  return (
    <main
      style={{
        height: "100dvh",
        width: "100%",
        background: "#090912",
        display: "flex",
        flexDirection: "column",
        fontFamily: '"JetBrains Mono", "Fira Code", monospace',
        overflow: "hidden",
      }}
    >
      <StrudelEditorDynamic />
    </main>
  );
}
