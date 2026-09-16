// Library-first delivery. Only material IDs survive navigation; no patient input is copied.
PC.materialSelection = [];
PC.loadMaterialSelection = () => {
  try {
    const ids = JSON.parse(
      sessionStorage.getItem(`pc_materials_${PC.user?.id || 0}`) || "[]",
    );
    PC.materialSelection = Array.isArray(ids)
      ? [...new Set(ids.filter((n) => Number.isSafeInteger(n) && n > 0))].slice(
          0,
          40,
        )
      : [];
  } catch {
    PC.materialSelection = [];
  }
};
PC.saveMaterialSelection = () => {
  try {
    sessionStorage.setItem(
      `pc_materials_${PC.user?.id || 0}`,
      JSON.stringify(PC.materialSelection),
    );
  } catch {}
};
PC.toggleMaterial = (id) => {
  if (PC.materialSelection.includes(id))
    PC.materialSelection = PC.materialSelection.filter((n) => n !== id);
  else {
    if (PC.materialSelection.length >= 40)
      return PC.toast("한 번에 최대 40개 자료까지 선택할 수 있습니다.", "err");
    PC.materialSelection.push(id);
  }
  PC.saveMaterialSelection();
  PC.renderMaterialTray();
};
PC.clearMaterials = () => {
  PC.materialSelection = [];
  PC.saveMaterialSelection();
  PC.renderMaterialTray();
};
PC.renderMaterialTray = () => {
  const ids = PC.materialSelection;
  document.querySelectorAll("[data-material-id]").forEach((el) => {
    if (el.disabled) return;
    const selected = ids.includes(Number(el.dataset.materialId));
    el.setAttribute("aria-pressed", String(selected));
    el.innerHTML = `<i class="fas ${selected ? "fa-check" : "fa-plus"}"></i>${selected ? "전송에 담김" : "전송 담기"}`;
    el.closest(".asset-card")?.classList.toggle("material-selected", selected);
  });
  const tray = document.getElementById("material-tray");
  if (!tray) return;
  tray.className = ids.length ? "material-tray visible" : "material-tray";
  tray.innerHTML = ids.length
    ? `<div class="tray-summary"><span class="tray-symbol"><i class="fas fa-layer-group"></i></span><div><b><span id="selected-material-count" aria-live="polite">${ids.length}</span>개 자료를 담았어요</b><p>환자 정보 없이, 선택 자료만 전달합니다.</p></div></div><div class="row"><button class="btn-link" onclick="PC.clearMaterials()">비우기</button><button class="btn-primary" id="quick-delivery-button" onclick="PC.quickDelivery()">선택 자료 보내기 <i class="fas fa-arrow-right"></i></button></div>`
    : "";
};
PC.quickDelivery = async (inputIds) => {
  const ids = [...new Set(inputIds || PC.materialSelection)];
  if (!ids.length) return PC.toast("보낼 자료를 먼저 담아주세요.");
  if (!PC.user?.clinic_id) {
    PC.modal(
      "전송은 병원 로그인 후 사용할 수 있어요",
      '<p class="help-note">자료는 로그인 없이 설명할 수 있습니다. 안내장 발급과 회수 관리를 위해 전송 시에는 병원 로그인이 필요합니다.</p>',
      '<button class="btn-ghost" onclick="PC.closeModal()">계속 둘러보기</button><a class="btn-primary" href="/login">병원 로그인</a>',
      true,
    );
    return;
  }
  if (PC.deliveryBusy) return;
  PC.deliveryBusy = true;
  const button = document.getElementById("quick-delivery-button");
  if (button) button.disabled = true;
  try {
    const key = `${PC.user.id}:${ids.join(",")}`;
    if (!PC.quickDraft || PC.quickDraft.key !== key) {
      const assets = await Promise.all(
        ids.map((id) =>
          axios.get(`/api/assets/${id}`).then((r) => r.data.asset),
        ),
      );
      if (assets.some((a) => a.type === "compare"))
        throw new Error(
          "비포·애프터는 원내 설명 전용입니다. 다른 자료만 선택해 주세요.",
        );
      const slides = assets.flatMap((a) => {
        const count = Math.max(
          1,
          (
            a.payload?.steps ||
            a.payload?.stages ||
            (["image", "video"].includes(a.type) ? a.media_urls : []) ||
            []
          ).length,
        );
        return Array.from({ length: count }, (_, sub_index) => ({
          asset_id: a.id,
          sub_index,
          note: "",
          internal_note: "",
          include_in_share: true,
        }));
      });
      if (slides.length > 40)
        throw new Error(
          `선택한 자료는 전체 ${slides.length}단계입니다. 40단계 이내로 나눠 보내주세요.`,
        );
      // Fresh draft, never PC.currentDraft(): prevents inherited notes and patient information.
      PC.quickDraft = {
        key,
        payload: {
          client_key: crypto.randomUUID(),
          write_key: crypto.randomUUID(),
          version: 1,
          status: "draft",
          patient_label: "",
          schedule_note: "",
          internal_note: "",
          slides,
        },
      };
    }
    const job = PC.quickDraft;
    if (!job.saved)
      job.saved = (await axios.post("/api/sessions", job.payload)).data;
    const preview = (await axios.get(`/api/sessions/${job.saved.id}/preview`))
      .data;
    PC.modal(
      "보낼 자료를 확인해 주세요",
      `<p class="delivery-eyebrow">REVIEW & SHARE</p><p class="help-note">선택한 자료의 전체 단계를 보냅니다. 이전 상담의 이름·메모·판서는 가져오지 않습니다.</p>${PC.patientPreviewHTML(preview)}<label class="field">링크 유효기간<select id="quick-share-days" class="input"><option value="7">7일</option><option value="30" selected>30일</option><option value="90">90일</option><option value="1">1일</option></select></label><label class="review-confirm"><input id="quick-delivery-confirm" type="checkbox">자료와 주의사항을 확인했습니다.</label><p class="help-note">링크를 가진 사람은 열람할 수 있습니다. 전송 이력에서 언제든 공유를 종료할 수 있습니다.</p>`,
      '<button class="btn-ghost" onclick="PC.closeModal()">돌아가기</button><button id="quick-publish" class="btn-primary">안내장 링크 만들기 <i class="fas fa-arrow-right"></i></button>',
    );
    document.getElementById("quick-publish").onclick = async (e) => {
      if (!document.getElementById("quick-delivery-confirm").checked)
        return PC.toast("보낼 내용을 먼저 확인해 주세요.", "err");
      const btn = e.currentTarget;
      btn.disabled = true;
      try {
        const { data } = await axios.post(
          `/api/sessions/${job.saved.id}/share`,
          {
            days: Number(document.getElementById("quick-share-days").value),
            version: job.saved.version,
          },
        );
        PC.quickDraft = null;
        PC.clearMaterials();
        PC.deliveryResult(data.url);
      } catch (err) {
        PC.error(err);
        if (btn.isConnected) btn.disabled = false;
      }
    };
  } catch (e) {
    PC.error(e);
  } finally {
    PC.deliveryBusy = false;
    if (button?.isConnected) button.disabled = false;
  }
};
PC.deliveryResult = (path) => {
  const url = new URL(path, location.origin).href;
  const clinic = PC.user?.clinic_name || "병원";
  const message = `[${clinic} 진료 안내]\n안녕하세요. ${clinic}입니다.\n진료 관련 안내자료와 주의사항을 보내드립니다.\n아래 링크에서 확인해 주세요.\n\n${url}`;
  PC.modal(
    "설명은 끝나도, 이해는 이어지도록.",
    `<section class="delivery-result"><span class="delivery-success"><i class="fas fa-check"></i></span><h3>안내장 링크가 준비됐어요.</h3><p>아직 환자에게 발송되지는 않았습니다.<br>카카오톡 대화방에 안내문을 붙여넣어 보내주세요.</p><div class="message-preview"><span><i class="fas fa-comment"></i> 카카오톡에 보낼 안내문</span><p>${PC.esc(message)}</p></div><button class="btn-kakao" id="copy-kakao-message"><i class="fas fa-comment"></i>카카오톡용 안내문 복사</button><div class="delivery-actions"><button class="btn-ghost" id="copy-prepared-link"><i class="fas fa-link"></i>링크만 복사</button><button class="btn-ghost" id="native-share-button"><i class="fas fa-arrow-up-from-bracket"></i>공유 앱 선택</button></div><a class="delivery-open" href="${PC.url(path)}" target="_blank" rel="noopener">환자 안내장 열기 <i class="fas fa-arrow-up-right-from-square"></i></a><p class="help-note">기기 공유 메뉴에 카카오톡이 있으면 선택할 수 있습니다. SOLAPI 알림톡 자동 발송은 아직 연결되지 않았습니다.</p><a class="btn-link" href="/manage?tab=sessions">전송 이력·링크 회수 관리</a></section>`,
    "",
    true,
  );
  document.getElementById("copy-kakao-message").onclick = async () => {
    try {
      await navigator.clipboard.writeText(message);
      PC.toast("안내문을 복사했습니다. 카카오톡 대화방에 붙여넣어 보내주세요.");
    } catch {
      PC.modal(
        "안내문을 직접 복사해 주세요",
        `<textarea class="input" rows="8" readonly onclick="this.select()">${PC.esc(message)}</textarea>`,
        "",
        true,
      );
    }
  };
  document.getElementById("copy-prepared-link").onclick = () => PC.copy(url);
  const share = document.getElementById("native-share-button");
  share.disabled = typeof navigator.share !== "function";
  share.title = share.disabled
    ? "이 브라우저는 기기 공유를 지원하지 않습니다. 안내문 복사를 이용하세요."
    : "공유할 앱과 수신자는 직접 선택합니다";
  share.onclick = async () => {
    try {
      await navigator.share({
        title: `${clinic} 진료 안내`,
        text: "진료 관련 안내자료와 주의사항을 확인해 주세요.",
        url,
      });
    } catch (e) {
      if (e.name !== "AbortError") PC.error(e);
    }
  };
};
