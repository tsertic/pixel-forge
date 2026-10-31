import { $ } from './dom.js';
import { animationFrames } from '../../shared/animations.js';

export function createTimeline({ getProject, action, drawCanvas }) {
  let playing = false,
    playIndex = 0,
    playTimer,
    renderedAnimationId = null;
  $('addAnimation').onclick = () => {
    stopPlayback();
    const name = prompt('New animation name (for example Run or Attack):', 'Run');
    if (name?.trim()) action([{ type: 'add_animation', name: name.trim() }], 'Animation added');
  };
  $('renameAnimation').onclick = () => {
    const project = getProject();
    const animation = project.animations.find((item) => item.id === project.activeAnimationId);
    const name = prompt('Animation name:', animation.name);
    if (name?.trim())
      action(
        [{ type: 'update_animation', animationId: animation.id, name: name.trim() }],
        'Animation renamed',
      );
  };
  $('deleteAnimation').onclick = () => {
    stopPlayback();
    const project = getProject();
    const animation = project.animations.find((item) => item.id === project.activeAnimationId);
    if (confirm(`Delete "${animation.name}" and all its frames?`))
      action([{ type: 'delete_animation', animationId: animation.id }], 'Animation deleted');
  };
  $('addFrame').onclick = () => {
    stopPlayback();
    action([{ type: 'add_frame', duplicate: false }], 'Frame added');
  };
  $('duplicateFrame').onclick = () => {
    stopPlayback();
    action([{ type: 'add_frame', duplicate: true }], 'Frame duplicated');
  };
  $('deleteFrame').onclick = () => {
    stopPlayback();
    if (confirm('Delete the selected frame?'))
      action([{ type: 'delete_frame', frameId: getProject().activeFrameId }], 'Frame deleted');
  };
  $('fps').onchange = (e) => {
    const value = Number(e.target.value);
    if (!Number.isInteger(value) || value < 1 || value > 60) {
      e.target.value = getProject().fps;
      return;
    }
    action([{ type: 'settings', fps: value }], 'Animation speed');
    if (playing) {
      stopPlayback();
      startPlayback();
    }
  };
  function stopPlayback() {
    playing = false;
    clearTimeout(playTimer);
    $('play').textContent = '▶';
    if (getProject()) drawCanvas();
  }
  function startPlayback() {
    if (!getProject()) return;
    playing = true;
    playIndex = animationFrames(getProject()).findIndex((f) => f.id === getProject().activeFrameId);
    $('play').textContent = 'Ⅱ';
    const tick = () => {
      if (!playing) return;
      drawCanvas();
      playIndex = (playIndex + 1) % animationFrames(getProject()).length;
      playTimer = setTimeout(tick, 1000 / getProject().fps);
    };
    tick();
  }
  $('play').onclick = () => (playing ? stopPlayback() : startPlayback());

  return {
    stop: stopPlayback,
    get state() {
      return { playing, playIndex };
    },
    update() {
      const project = getProject();
      if (renderedAnimationId !== project.activeAnimationId) stopPlayback();
      renderedAnimationId = project.activeAnimationId;
      if (playing && playIndex >= animationFrames(project).length) playIndex = 0;
      const container = $('animationTabs');
      const scroll = container.scrollLeft;
      container.replaceChildren();
      for (const animation of project.animations) {
        const button = document.createElement('button');
        button.className = 'animation-tab';
        button.dataset.animation = animation.id;
        button.setAttribute('role', 'tab');
        button.setAttribute('aria-selected', String(animation.id === project.activeAnimationId));
        button.setAttribute('aria-label', animation.name);
        button.classList.toggle('active', animation.id === project.activeAnimationId);
        button.textContent = animation.name;
        const count = document.createElement('span');
        count.textContent = animationFrames(project, animation.id).length;
        button.append(count);
        button.onclick = () => {
          stopPlayback();
          action([{ type: 'select', animationId: animation.id }], 'Animation selected');
        };
        container.append(button);
      }
      container.scrollLeft = scroll;
      $('deleteAnimation').disabled = project.animations.length === 1;
      $('addAnimation').disabled = project.animations.length >= 32 || project.frames.length >= 64;
    },
  };
}
