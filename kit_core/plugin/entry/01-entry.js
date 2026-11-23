// Điểm vào plugin (luôn nằm cuối bundle): mở cửa sổ cục bộ và xử lý lệnh từ ui.html.
figma.showUI(__html__, { width: 420, height: 480, title: stConfig().name || 'Đồng bộ thiết kế' });

figma.ui.onmessage = async (msg) => {
  if (!msg) return;
  if (await handlePluginMessage(msg)) return;
  if (msg.type === 'CLOSE') figma.closePlugin();
};
