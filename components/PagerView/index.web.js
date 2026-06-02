import React, {
  Children,
  forwardRef,
  useCallback,
  useImperativeHandle,
  useMemo,
  useState,
} from 'react';
import { View } from 'react-native';

function WebPagerView({ children, initialPage = 0, onPageSelected, style }, ref) {
  const pages = useMemo(() => Children.toArray(children), [children]);
  const [page, setPage] = useState(initialPage);

  const selectPage = useCallback(
    (nextPage) => {
      const boundedPage = Math.max(0, Math.min(nextPage, pages.length - 1));
      setPage(boundedPage);
      onPageSelected?.({ nativeEvent: { position: boundedPage } });
    },
    [onPageSelected, pages.length]
  );

  useImperativeHandle(ref, () => ({ setPage: selectPage }), [selectPage]);

  return <View style={style}>{pages[page] ?? null}</View>;
}

export default forwardRef(WebPagerView);
