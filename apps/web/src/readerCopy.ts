import type { Language } from '@the-word/core';
const en = { read:'Read', saved:'Saved', study:'Study', back:'Back to reading', audio:'Audio', profile:'Profile', backup:'Backup & connection', reading:'Reading', share:'Share passage', image:'Create image', context:'Context', related:'Related verses', explanation:'Explanation', group:'Group study', more:'Study options' };
export const readerCopy: Record<Language, typeof en> = {
  en,
  es: { read:'Leer', saved:'Guardado', study:'Estudiar', back:'Volver a la lectura', audio:'Audio', profile:'Perfil', backup:'Copia y conexión', reading:'Lectura', share:'Compartir pasaje', image:'Crear imagen', context:'Contexto', related:'Versículos relacionados', explanation:'Explicación', group:'Estudio en grupo', more:'Opciones de estudio' },
  fr: { read:'Lire', saved:'Enregistrés', study:'Étudier', back:'Retour à la lecture', audio:'Audio', profile:'Profil', backup:'Sauvegarde et connexion', reading:'Lecture', share:'Partager le passage', image:'Créer une image', context:'Contexte', related:'Versets associés', explanation:'Explication', group:'Étude en groupe', more:'Options d’étude' },
  zh: { read:'阅读', saved:'已保存', study:'研读', back:'返回阅读', audio:'音频', profile:'个人资料', backup:'备份与连接', reading:'阅读', share:'分享经文', image:'创建图片', context:'上下文', related:'相关经文', explanation:'解释', group:'小组研读', more:'研读选项' },
  vi: { read:'Đọc', saved:'Đã lưu', study:'Học', back:'Trở lại đọc', audio:'Âm thanh', profile:'Hồ sơ', backup:'Sao lưu và kết nối', reading:'Đọc', share:'Chia sẻ đoạn', image:'Tạo ảnh', context:'Ngữ cảnh', related:'Câu liên quan', explanation:'Giải thích', group:'Học nhóm', more:'Tùy chọn học' },
};
