import * as React from 'react';
import * as _ from 'lodash';
import DashboardCard from '@console/shared/src/components/dashboard/dashboard-card/DashboardCard';
import DashboardCardBody from '@console/shared/src/components/dashboard/dashboard-card/DashboardCardBody';
import DashboardCardHeader from '@console/shared/src/components/dashboard/dashboard-card/DashboardCardHeader';
import DashboardCardTitle from '@console/shared/src/components/dashboard/dashboard-card/DashboardCardTitle';
import { EventKind } from '@console/internal/module/k8s';
import { FirehoseResource, FirehoseResult } from '@console/internal/components/utils';
import { EventModel, StatefulSetModel, PodModel } from '@console/internal/models';
import ActivityBody, {
  RecentEventsBody,
  OngoingActivityBody,
} from '@console/shared/src/components/dashboard/activity-card/ActivityBody';
import { PrometheusResponse } from '@console/internal/components/graphs';
import {
  DashboardItemProps,
  withDashboardResources,
} from '@console/internal/components/dashboard/with-dashboard-resources';
import { getResiliencyProgress } from '@console/ceph-storage-plugin/src/utils';
import { CephObjectStoreModel } from '@console/ceph-storage-plugin/src/models';
import { DATA_RESILIENCE_QUERIES } from '../../queries';
import {
  NooBaaBackingStoreModel,
  NooBaaBucketClassModel,
  NooBaaObjectBucketClaimModel,
} from '../../models';
import './activity-card.scss';

const eventsResource: FirehoseResource = { isList: true, kind: EventModel.kind, prop: 'events' };

const isObjectStorageEvent = (event: EventKind): boolean => {
  const eventName: string = event?.involvedObject?.name;
  return _.startsWith(eventName, 'noobaa') || eventName.includes('rgw');
};

const objectStorageEventsFilter = (event: EventKind): boolean => {
  const eventKind: string = event?.involvedObject?.kind;
  const objectStorageResources = [
    NooBaaBackingStoreModel.kind,
    NooBaaBucketClassModel.kind,
    NooBaaObjectBucketClaimModel.kind,
    CephObjectStoreModel.kind,
  ];
  if (eventKind === PodModel.kind || eventKind === StatefulSetModel.kind) {
    return isObjectStorageEvent(event);
  }
  return objectStorageResources.includes(eventKind);
};

const RecentEvent = withDashboardResources(
  ({ watchK8sResource, stopWatchK8sResource, resources }: DashboardItemProps) => {
    React.useEffect(() => {
      watchK8sResource(eventsResource);
      return () => {
        stopWatchK8sResource(eventsResource);
      };
    }, [watchK8sResource, stopWatchK8sResource]);
    return (
      <RecentEventsBody
        events={resources.events as FirehoseResult<EventKind[]>}
        filter={objectStorageEventsFilter}
      />
    );
  },
);

const OngoingActivity = withDashboardResources(
  ({ watchPrometheus, stopWatchPrometheusQuery, prometheusResults }: DashboardItemProps) => {
    React.useEffect(() => {
      watchPrometheus(DATA_RESILIENCE_QUERIES.REBUILD_PROGRESS_QUERY);
      watchPrometheus(DATA_RESILIENCE_QUERIES.REBUILD_TIME_QUERY);
      watchPrometheus(DATA_RESILIENCE_QUERIES.RGW_PROGRESS_QUERY);
      return () => {
        stopWatchPrometheusQuery(DATA_RESILIENCE_QUERIES.REBUILD_PROGRESS_QUERY);
        stopWatchPrometheusQuery(DATA_RESILIENCE_QUERIES.REBUILD_TIME_QUERY);
        stopWatchPrometheusQuery(DATA_RESILIENCE_QUERIES.RGW_PROGRESS_QUERY);
      };
    }, [watchPrometheus, stopWatchPrometheusQuery]);

    const progress = prometheusResults.getIn([
      DATA_RESILIENCE_QUERIES.REBUILD_PROGRESS_QUERY,
      'data',
    ]) as PrometheusResponse;
    const progressError = prometheusResults.getIn([
      DATA_RESILIENCE_QUERIES.REBUILD_PROGRESS_QUERY,
      'loadError',
    ]);

    const eta = prometheusResults.getIn([
      DATA_RESILIENCE_QUERIES.REBUILD_TIME_QUERY,
      'data',
    ]) as PrometheusResponse;

    const rgwProgress = prometheusResults.getIn([
      DATA_RESILIENCE_QUERIES.REBUILD_PROGRESS_QUERY,
      'data',
    ]) as PrometheusResponse;

    const rgwProgressError = prometheusResults.getIn([
      DATA_RESILIENCE_QUERIES.REBUILD_PROGRESS_QUERY,
      'loadError',
    ]);

    const prometheusActivities = [];

    if (getResiliencyProgress(progress) < 1) {
      prometheusActivities.push({
        results: [progress, eta],
        loader: () =>
          import('./data-resiliency-activity/data-resiliency-activity').then(
            (m) => m.NoobaaDataResiliency,
          ),
      });
    }

    if (getResiliencyProgress(rgwProgress) < 1) {
      prometheusActivities.push({
        results: [rgwProgress],
        loader: () =>
          import('./data-resiliency-activity/data-resiliency-activity').then(
            (m) => m.NoobaaDataResiliency,
          ),
      });
    }

    return (
      <OngoingActivityBody
        loaded={progress || progressError || rgwProgress || rgwProgressError}
        prometheusActivities={prometheusActivities}
      />
    );
  },
);

const ActivityCard: React.FC<{}> = () => (
  <DashboardCard gradient>
    <DashboardCardHeader>
      <DashboardCardTitle>Activity</DashboardCardTitle>
    </DashboardCardHeader>
    <DashboardCardBody>
      <ActivityBody className="nb-activity-card__body">
        <OngoingActivity />
        <RecentEvent />
      </ActivityBody>
    </DashboardCardBody>
  </DashboardCard>
);

export default ActivityCard;
