import { InfoCard } from "@/components/ui/info-card";

interface ProductInfoProps {
  productName: string | null;
  productUrl: string | null;
}

export function ProductInfo({ productName, productUrl }: ProductInfoProps) {
  if (!productName && !productUrl) return null;

  return (
    <InfoCard title="Товар">
      {productName && (
        <p className="text-sm font-medium text-gray-900">{productName}</p>
      )}
      {productUrl && (
        <a
          href={productUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-brand hover:underline break-all mt-1 block"
        >
          {productUrl}
        </a>
      )}
    </InfoCard>
  );
}
