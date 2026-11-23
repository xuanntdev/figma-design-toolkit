// Điểm vào plugin (luôn nằm cuối bundle): mở cửa sổ cục bộ và xử lý lệnh từ ui.html.
const readOnlyWindow = stConfig().readOnly === true;
figma.showUI(__html__, { width: readOnlyWindow ? 370 : 420, height: readOnlyWindow ? 146 : 480, title: stConfig().name || 'Đồng bộ thiết kế' });

figma.ui.onmessage = async (msg) => {
  if (!msg) return;
  if (await handlePluginMessage(msg)) return;
  if (msg.type === 'CLOSE') figma.closePlugin();
};
