export const ONBOARDING_STORAGE_KEY = 'tapa_onboarding_seen_version';
export const ONBOARDING_VERSION = 'v4';
export const ONBOARDING_DEMO_VIDEO_KEYWORD = '\u6797\u4f9d\u6668';
export const ONBOARDING_DEMO_VIDEO_SEEK_SEC = 255;

export type OnboardingTargetId =
  | 'video_select'
  | 'transport_controls'
  | 'annotation_button'
  | 'person_pick'
  | 'driver_select'
  | 'save_annotation'
  | 'my_annotations_button'
  | 'annotation_action'
  | 'annotation_card'
  | 'menu_button';

export type OnboardingStep = {
  id: string;
  title: string;
  description: string;
  targetId: OnboardingTargetId;
  requireAction: boolean;
  actionHint?: string;
};

export const ONBOARDING_STEPS: OnboardingStep[] = [
  {
    id: 'switch_video',
    title: '\u5207\u6362\u89c6\u9891',
    description:
      '\u5728\u9875\u9762\u5de6\u4e0a\u89d2\u901a\u8fc7\u4e0b\u62c9\u6846\u5207\u6362\u5f53\u524d\u8bad\u7ec3\u89c6\u9891\u3002',
    targetId: 'video_select',
    requireAction: true,
    actionHint:
      '\u8bf7\u70b9\u51fb\u4e00\u6b21\u5de6\u4e0a\u89d2\u89c6\u9891\u4e0b\u62c9\u6846\uff0c\u5b8c\u6210\u540e\u518d\u8fdb\u5165\u4e0b\u4e00\u6b65\u3002',
  },
  {
    id: 'playback_controls',
    title: '\u64ad\u653e\u63a7\u5236',
    description:
      '\u8fd9\u4e00\u6392\u6309\u94ae\u5305\u542b -3s\u3001+3s \u548c\u901f\u5ea6\u3002\u53ef\u7528\u4e8e\u7ec6\u770b\u67d0\u4e2a\u7247\u6bb5\u3002',
    targetId: 'transport_controls',
    requireAction: true,
    actionHint:
      '\u8bf7\u70b9\u51fb\u4e00\u6b21 -3s\u3001+3s \u6216\u901f\u5ea6\u6309\u94ae\u4e2d\u7684\u4efb\u610f\u4e00\u4e2a\u3002',
  },
  {
    id: 'open_annotation_on_demo',
    title: '\u6253\u5f00\u793a\u4f8b\u6807\u6ce8',
    description:
      '\u73b0\u5728\u4f1a\u81ea\u52a8\u5207\u6362\u5230\u300c\u6797\u4f9d\u6668\u300d\u89c6\u9891\u7684 4:15\u3002\u8bf7\u70b9\u51fb\u63a7\u5236\u6761\u4e0a\u7684\u6807\u6ce8\u6309\u94ae\u3002',
    targetId: 'annotation_button',
    requireAction: true,
  },
  {
    id: 'select_person',
    title: '\u9009\u62e9\u89c2\u5bdf\u5bf9\u8c61',
    description:
      '\u70b9\u51fb\u4eba\u7269\u9009\u62e9\u6309\u94ae\u540e\uff0c\u5728\u89c6\u9891\u753b\u9762\u4e2d\u70b9\u51fb\u4f60\u8981\u6807\u6ce8\u7684\u90a3\u4e2a\u4eba\u3002',
    targetId: 'person_pick',
    requireAction: true,
  },
  {
    id: 'select_drive',
    title: '\u9009\u62e9\u9a71\u529b',
    description: '\u5728\u6807\u6ce8\u9762\u677f\u4e2d\u9009\u62e9\u4e00\u4e2a\u6216\u591a\u4e2a\u9a71\u529b\u3002',
    targetId: 'driver_select',
    requireAction: true,
  },
  {
    id: 'save_annotation',
    title: '\u4fdd\u5b58\u6807\u6ce8',
    description: '\u70b9\u51fb\u4fdd\u5b58\u6807\u6ce8\u6309\u94ae\uff0c\u5c06\u5f53\u524d\u6807\u6ce8\u4fdd\u5b58\u5230\u670d\u52a1\u7aef\u3002',
    targetId: 'save_annotation',
    requireAction: true,
  },
  {
    id: 'open_annotation_history',
    title: '\u6253\u5f00\u6807\u6ce8\u5217\u8868',
    description:
      '\u70b9\u51fb\u9876\u90e8\u53f3\u4e0a\u89d2\u7684\u6807\u6ce8\u5217\u8868\u6309\u94ae\uff0c\u67e5\u770b\u4f60\u521a\u624d\u4fdd\u5b58\u7684\u6807\u6ce8\u5361\u7247\u3002',
    targetId: 'my_annotations_button',
    requireAction: true,
  },
  {
    id: 'open_annotation_action_menu',
    title: '\u67e5\u770b\u5220\u9664\u5165\u53e3',
    description:
      '\u70b9\u51fb\u6807\u6ce8\u5361\u7247\u53f3\u4e0a\u89d2\u7684\u300c\u6807\u6ce8\u4fee\u8ba2\u300d\u6309\u94ae\uff0c\u5373\u53ef\u770b\u5230\u7f16\u8f91\u548c\u5220\u9664\u5165\u53e3\u3002\u4f60\u4e0d\u9700\u8981\u771f\u6b63\u6267\u884c\u5220\u9664\u3002',
    targetId: 'annotation_action',
    requireAction: true,
    actionHint:
      '\u8bf7\u70b9\u5f00\u4efb\u610f\u4e00\u5f20\u6807\u6ce8\u5361\u7247\u53f3\u4e0a\u89d2\u7684\u300c\u6807\u6ce8\u4fee\u8ba2\u300d\u3002',
  },
  {
    id: 'jump_by_annotation_card',
    title: '\u901a\u8fc7\u5361\u7247\u8df3\u8f6c',
    description:
      '\u70b9\u51fb\u4efb\u610f\u4e00\u5f20\u6807\u6ce8\u5361\u7247\uff0c\u64ad\u653e\u5668\u4f1a\u8df3\u8f6c\u5230\u5bf9\u5e94\u65f6\u95f4\u70b9\u3002',
    targetId: 'annotation_card',
    requireAction: true,
  },
  {
    id: 'open_hamburger_menu',
    title: '\u6253\u5f00\u6c49\u5821\u83dc\u5355',
    description:
      '\u6700\u540e\u70b9\u51fb\u53f3\u4e0a\u89d2\u6c49\u5821\u83dc\u5355\uff0c\u5237\u65b0\u64ad\u653e\u94fe\u63a5\u3001\u5e2e\u52a9\u3001\u767b\u51fa\u7b49\u9009\u9879\u90fd\u5728\u8fd9\u91cc\u3002',
    targetId: 'menu_button',
    requireAction: true,
  },
] as const;
