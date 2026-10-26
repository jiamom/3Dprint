// Font entries are supplied by the numbered scripts that follow this file.
window.BAMBU_FONTS=[];

window.keyringFontSample=(font,text)=>font?.latinOnly&&/[ㄱ-ㅎㅏ-ㅣ가-힣]/.test(text)?font.sample:text;
