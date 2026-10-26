import { Background, BackgroundVariant, ConnectionLineType, ConnectionMode, ReactFlow, SelectionMode, ViewportPortal } from "@xyflow/react";
import { CSSProperties } from "react";
import { StudioNotice } from "../../vendor/object-kit/components/studio/StudioNotice";
import { METHODS } from "../core/methods/common";
import { format } from "../shared/i18n";
import { DRAWER_WIDTH, LARGE_VIEW, NONE, OPL_COLLAPSED, OPL_HEIGHT } from "./app/constants";
import { TabState } from "./app/contracts";
import { isEditable } from "./app/isEditable";
import { linkOperation } from "./app/linkOperations";
import { Splitter } from "./app/Splitter";
import { useDiagramEditor } from "./app/useDiagramEditor";
import { Zoom } from "./app/Zoom";
import { edgeTypes } from "./edges";
import { Makigami } from "./makigami";
import { methodMessages } from "./methods/messages";
import { MethodPanel } from "./methods/panel";
import { nodeTypes, ThingLabels } from "./nodes";
import { ContextMenu, Inspector, LinkMenu, OplBar, Toolbar } from "./panels";
import { post, saveTabState } from "./vscode";

export function App() {
  const {
    drawer, hasSelection, story, wrapper, oplExpanded, oplHeight, rightDown, setContext, frozen, flow,
    openContext, nodes, edges, onNodesChange, onEdgesChange, onNodeDragStop, onConnectStart, onConnectEnd,
    setMenu, viewports, viewId, oplMode, labelsOn, drawerWidth, storyId, boxSelecting, view, t, trail, goTo,
    addElement, selectedObject, addState, arrange, storyList, setMethod, setStoryId, setSelection, setEdgeSel,
    createNewStory, exportImage, saveView, selection, setLabelsOn, language, openMethod, layingOut,
    parseError, content, empty, menu, model, size, run, context, contextMenu, closeContext, confirm,
    setConfirm, toast, method, storyDiagnostics, setReveal, useFocus, focusSentences, viewSentences, focus,
    setOplExpanded, setOplMode, shownIds, setOplHeight, dragBase, inspectorProps, setDrawerWidth
  } = useDiagramEditor();


  /* ---------- render ---------- */

  return (
    <div className={`opm-app${drawer && hasSelection && !story ? " with-drawer" : ""}`}>
      <div className="opm-canvas" ref={wrapper}
        style={{ "--opl-h": `${oplExpanded ? oplHeight : OPL_COLLAPSED}px` } as CSSProperties}
        onPointerDownCapture={(e) => {
          if (e.button === 2) rightDown.current = { x: e.clientX, y: e.clientY };
          if (!(e.target as HTMLElement).closest(".opm-context")) setContext(null);
        }}
        onDoubleClick={(e) => {
          const el = e.target as HTMLElement;
          if (frozen || isEditable(el) || !el.classList.contains("react-flow__pane")) return;
          const box = wrapper.current!.getBoundingClientRect();
          const p = flow.screenToFlowPosition({ x: e.clientX, y: e.clientY });
          setContext({ x: e.clientX - box.left, y: e.clientY - box.top, pos: [Math.round(p.x), Math.round(p.y)], on: "pane" });
        }}
        onContextMenu={openContext}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeDragStop={onNodeDragStop}
          onConnectStart={onConnectStart}
          onConnectEnd={onConnectEnd}
          onPaneClick={() => { setMenu(null); setContext(null); }}
          onMoveEnd={(_e, vp) => {
            viewports.current = { ...viewports.current, [viewId]: vp };
            saveTabState({ viewId, drawer, oplExpanded, oplMode, labelsOn, viewports: viewports.current, drawerWidth, oplHeight, storyId } satisfies TabState);
          }}
          zIndexMode="manual"
          connectionMode={ConnectionMode.Loose}
          connectionLineType={ConnectionLineType.Straight}
          connectionLineStyle={{ strokeDasharray: "5 4" }}
          connectOnClick={false}
          nodesConnectable={!frozen}
          nodesDraggable={!frozen}
          deleteKeyCode={null}
          disableKeyboardA11y
          zoomOnDoubleClick={false}
          panOnDrag={[1, 2]}
          selectionOnDrag
          selectionMode={SelectionMode.Full}
          onSelectionStart={() => { boxSelecting.current = true; }}
          onSelectionEnd={() => { boxSelecting.current = false; }}
          minZoom={0.1}
          maxZoom={3}
          proOptions={{ hideAttribution: true }}
        >
          <Background variant={BackgroundVariant.Dots} gap={20} size={1} className="opm-grid" />
          <ViewportPortal><ThingLabels nodes={nodes} /></ViewportPortal>
        </ReactFlow>

        {view && (
          <Toolbar
            t={t}
            trail={trail}
            disabled={frozen}
            onView={(id) => id !== viewId && goTo(id)}
            onAddObject={() => void addElement("object")}
            onAddProcess={() => void addElement("process")}
            onAddState={selectedObject ? () => addState() : undefined}
            onArrange={(a) => void arrange(a)}
            stories={storyList}
            onOpenStory={(id) => { setMethod(null); setStoryId(id); setSelection([]); setEdgeSel(null); }}
            onNewStory={() => void createNewStory()}
            menu={[
              { label: t.exportPng, action: () => void exportImage("png") },
              { label: t.exportSvg, action: () => void exportImage("svg") },
              { label: t.exportMarkdown, action: () => post({ type: "exportMarkdown" }) },
              { label: t.createSchema, action: () => post({ type: "createSchema" }), disabled: frozen },
              { label: t.saveAsView, action: saveView, disabled: !selection.length },
              { label: t.linkLabels, action: () => setLabelsOn(!labelsOn), checked: labelsOn },
              { label: t.openTextBeside, action: () => post({ type: "openTextBeside" }) },
              ...METHODS.map((id) => ({ label: methodMessages(language).menu[id], action: () => openMethod(id) })),
            ]}
          />
        )}

        {layingOut && <div className="opm-busy">ELK…</div>}

        {parseError !== null && (
          <div className="opm-banner error">
            {format(t.parseErrorBanner, { line: parseError })}
            <button className="link" onClick={() => post({ type: "openTextBeside" })}>{t.openTextBeside}</button>
          </div>
        )}
        {content && content.nodes.length > LARGE_VIEW && (
          <div className="opm-banner">{format(t.largeView, { n: content.nodes.length })}</div>
        )}

        {empty && !frozen && (
          <div className="opm-empty">
            <div>{t.emptyHint}</div>
            <div className="opm-actions">
              <button className="opm-button primary" onClick={() => void addElement("object")}>▭ {t.object}</button>
              <button className="opm-button primary" onClick={() => void addElement("process")}>◯ {t.process}</button>
              <button className="opm-button primary" onClick={() => void createNewStory()}>▤ {t.newStory}</button>
            </div>
          </div>
        )}

        {menu && model && (
          <LinkMenu
            t={t}
            language={language}
            x={Math.min(menu.x, size.w - 220)}
            y={Math.min(menu.y, size.h - 40 - 28 * (menu.kinds.length + 2))}
            kinds={menu.kinds}
            effectTargets={menu.effectTargets}
            onPick={(kind, target) => { setMenu(null); void run(linkOperation(model, menu, kind, target)); }}
            onCancel={() => setMenu(null)}
          />
        )}

        {context && contextMenu && (
          <ContextMenu x={context.x} y={context.y} {...contextMenu} onClose={closeContext} />
        )}

        {confirm && (
          <div className="opm-confirm">
            <div>{confirm.text}</div>
            <div className="opm-actions">
              <button className="opm-button primary" onClick={() => { confirm.run(); setConfirm(null); }}>{confirm.action}</button>
              <button className="opm-button" onClick={() => setConfirm(null)}>{t.cancel}</button>
            </div>
          </div>
        )}

        {toast && <StudioNotice className="opm-toast" tone={toast.error ? "error" : "info"}>{toast.text}</StudioNotice>}

        <Zoom t={t} />

        {method && model && (
          <MethodPanel model={model} state={method} language={language} onChange={setMethod} onClose={() => setMethod(null)} />
        )}
        {story && model && storyId && (
          <Makigami
            t={t}
            model={model}
            id={storyId}
            story={story}
            diagnostics={storyDiagnostics}
            onBack={() => setStoryId(null)}
            onShow={(id) => { setStoryId(null); setReveal({ elementId: id }); }}
            onRun={frozen ? undefined : (op) => run(op)}
            onDeleteStory={frozen ? undefined : () => {
              void run({ op: "setStory", id: storyId, story: null });
              setStoryId(null);
            }}
          />
        )}

        <OplBar
          t={t}
          sentences={useFocus ? focusSentences : viewSentences}
          expanded={oplExpanded}
          mode={oplMode}
          selectionActive={useFocus}
          selected={useFocus ? NONE : focus}
          onToggle={() => setOplExpanded(!oplExpanded)}
          onMode={setOplMode}
          onSelect={(refs) => {
            const inView = refs.filter((r) => shownIds.has(r));
            if (inView.length) { setSelection(inView); setEdgeSel(null); }
          }}
        />
        {oplExpanded && !story && (
          <Splitter
            axis="y"
            onReset={() => setOplHeight(OPL_HEIGHT)}
            onDrag={(d, end) => {
              if (!dragBase.current) dragBase.current = oplHeight;
              setOplHeight(Math.round(Math.max(80, Math.min(size.h * 0.7, dragBase.current - d))));
              if (end) dragBase.current = 0;
            }}
          />
        )}
      </div>
      {drawer && hasSelection && inspectorProps && !story && (
        <>
          <Splitter
            axis="x"
            onReset={() => setDrawerWidth(DRAWER_WIDTH)}
            onDrag={(d, end) => {
              if (!dragBase.current) dragBase.current = drawerWidth;
              setDrawerWidth(Math.round(Math.max(220, Math.min(window.innerWidth * 0.6, dragBase.current - d))));
              if (end) dragBase.current = 0;
            }}
          />
          <div className="opm-drawer-pane" style={{ width: drawerWidth }}><Inspector {...inspectorProps} /></div>
        </>
      )}
    </div>
  );
}
