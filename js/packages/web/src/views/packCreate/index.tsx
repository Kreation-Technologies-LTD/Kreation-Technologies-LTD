import React, {
  ReactElement,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  PackDistributionType,
  useConnection,
  useUserAccounts,
} from '@oyster/common';
import { useWallet } from '@solana/wallet-adapter-react';
import { useHistory } from 'react-router-dom';

import { SafetyDepositDraft } from '../../actions/createAuctionManager';
import { useExtendedArt, useUserArts } from '../../hooks';

import { PackState } from './interface';
import { INITIAL_PACK_STATE } from './data';
import { CreatePackSteps } from './types';
import { packItemsFilter, vouchersFilter, exceededPacksCountNotification } from './utils';
import { MAX_PACKS_CREATION_COUNT } from '../../constants';
import useStep from './hooks/useStep';

import Header from './components/Header';
import Sidebar from './components/Sidebar';
import SelectItemsStep from './components/SelectItemsStep';
import AdjustQuantitiesStep from './components/AdjustQuantitiesStep';
import ReviewAndMintStep from './components/ReviewAndMintStep';
import { sendCreatePack } from './transactions/createPack';
import SuccessModal from './components/SuccessModal';
import { useValidation } from './hooks/useValidation';

export const PackCreateView = (): ReactElement => {
  const history = useHistory();
  const [attributes, setAttributes] = useState<PackState>(INITIAL_PACK_STATE);
  const [shouldShowSuccessModal, setShouldShowSuccessModal] =
    useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  const items = useUserArts();
  const { step, goToNextStep, resetStep } = useStep();
  const wallet = useWallet();
  const connection = useConnection();
  const { accountByMint } = useUserAccounts();
  const isValidStep = useValidation({ attributes, step });

  const {
    selectedItems,
    selectedVouchers,
    distributionType,
    weightByMetadataKey,
    supplyByMetadataKey,
    allowedAmountToRedeem,
    name,
    description,
    uri,
    isUnlimitedSupply,
  } = attributes;

  const itemsToSelect = useMemo(
    () => items.filter(packItemsFilter(selectedItems, isUnlimitedSupply)),
    [items, selectedItems],
  );
  const vouchersToSelect = useMemo(
    () => items.filter(vouchersFilter(selectedItems)),
    [items, selectedItems],
  );

  const setPackState = useCallback(
    (value: Partial<PackState>) => {
      setAttributes({ ...attributes, ...value });
    },
    [attributes, setAttributes],
  );

  const selectedVoucherId = Object.keys(selectedVouchers)[0];
  const { ref, data } = useExtendedArt(selectedVoucherId);

  useEffect(() => {
    if (!data) return;

    setPackState({
      uri: data.image,
      name: data.name,
      description: data.description,
    });
  }, [data]);

  const handleSelectItem = useCallback(
    (item: SafetyDepositDraft): void => {
      const { metadata, masterEdition } = item;

      if (!metadata?.pubkey) {
        return;
      }

      const updatedSelectedItems = { ...selectedItems };

      if (updatedSelectedItems[metadata.pubkey]) {
        delete updatedSelectedItems[metadata.pubkey];
      } else {
        updatedSelectedItems[metadata.pubkey] = item;
        if(Object.keys(updatedSelectedItems).length > MAX_PACKS_CREATION_COUNT) {
          exceededPacksCountNotification();
          return;
        }
      }

      const isUnlimitedSupply = masterEdition?.info.maxSupply === undefined;

      setPackState({
        selectedItems: updatedSelectedItems,
        distributionType: isUnlimitedSupply
          ? PackDistributionType.Unlimited
          : PackDistributionType.Fixed,
        isUnlimitedSupply,
      });
    },
    [setPackState, selectedItems],
  );

  const handleSelectVoucher = useCallback(
    (item: SafetyDepositDraft): void => {
      const { metadata } = item;

      if (!metadata?.pubkey) {
        return;
      }

      let updatedSelectedVouchers = { ...selectedVouchers };

      if (updatedSelectedVouchers[metadata.pubkey]) {
        delete updatedSelectedVouchers[metadata.pubkey];
      } else {
        updatedSelectedVouchers = { [metadata.pubkey]: item };
      }

      setPackState({ selectedVouchers: updatedSelectedVouchers });
    },
    [setPackState, selectedVouchers],
  );

  const handleSubmit = useCallback(async (): Promise<void> => {
    const canSubmit =
      wallet &&
      !!Object.values(selectedItems).length &&
      !!Object.values(selectedVouchers).length;

    if (canSubmit) {
      setIsLoading(true);
      try {
        await sendCreatePack({
          wallet,
          connection,
          accountByMint,
          data: attributes,
        });

        setShouldShowSuccessModal(true);
      } catch (e) {
        console.log(e);
      }
    }
    setIsLoading(false);
  }, [wallet, connection, accountByMint, attributes]);

  const handleFinish = useCallback(() => {
    setAttributes(INITIAL_PACK_STATE);
    resetStep();
    setShouldShowSuccessModal(false);
    history.push('/artworks');
  }, []);

  return (
    <div className="pack-create-wrapper" ref={ref}>
      <Sidebar
        step={step}
        setStep={goToNextStep}
        isValidStep={isValidStep}
        submit={handleSubmit}
        buttonLoading={isLoading}
      />
      <div className="content-wrapper">
        <Header step={step} />

        {step === CreatePackSteps.SelectItems && (
          <SelectItemsStep
            items={itemsToSelect}
            selectedItems={selectedItems}
            handleSelectItem={handleSelectItem}
          />
        )}

        {step === CreatePackSteps.SelectVoucher && (
          <SelectItemsStep
            items={vouchersToSelect}
            selectedItems={selectedVouchers}
            handleSelectItem={handleSelectVoucher}
            showSupply
            emptyMessage="You need to have minted supply of NFT to use it as a voucher."
          />
        )}

        {step === CreatePackSteps.AdjustQuantities && (
          <AdjustQuantitiesStep
            allowedAmountToRedeem={allowedAmountToRedeem}
            selectedItems={selectedItems}
            distributionType={distributionType}
            weightByMetadataKey={weightByMetadataKey}
            supplyByMetadataKey={supplyByMetadataKey}
            isUnlimited={isUnlimitedSupply}
            setPackState={setPackState}
          />
        )}

        {step === CreatePackSteps.ReviewAndMint && (
          <ReviewAndMintStep
            uri={uri}
            name={name}
            description={description}
            distributionType={distributionType}
            allowedAmountToRedeem={allowedAmountToRedeem}
            supplyByMetadataKey={supplyByMetadataKey}
          />
        )}
      </div>

      <SuccessModal shouldShow={shouldShowSuccessModal} hide={handleFinish} />
    </div>
  );
};
